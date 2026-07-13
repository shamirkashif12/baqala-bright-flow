using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

// ─── Database (MySQL) ────────────────────────────────────────────────────────
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("No database connection string found.");

builder.Services.AddDbContext<BaqalaDbContext>(options =>
    options.UseMySQL(connectionString));

// ─── CORS (allow React frontend) ─────────────────────────────────────────────
builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendPolicy", policy =>
    {
        policy
            .SetIsOriginAllowed(_ => true) // Allow any origin — local print agent must accept requests from any hosted frontend
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
        options.JsonSerializerOptions.DefaultIgnoreCondition =
            System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull;
        // Prevent circular reference crashes (EF navigation back-references)
        options.JsonSerializerOptions.ReferenceHandler =
            System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
        // Ensure all DateTime values are serialized with "Z" (UTC) suffix.
        // EF reads MySQL datetimes as DateTimeKind.Unspecified; without this converter
        // the JSON has no timezone marker and browsers interpret it as local time.
        options.JsonSerializerOptions.Converters.Add(new BaqalaPOS.Api.Services.UtcDateTimeConverter());
    });

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<IEmailService, SmtpEmailService>();
builder.Services.AddScoped<IAuditService, AuditService>();
builder.Services.AddScoped<INotificationService, NotificationService>();
builder.Services.AddHostedService<OperationalAlertsService>();
builder.Services.AddHostedService<UsbPrinterAutoInstallService>();

// ─── ZATCA (Saudi e-invoicing Phase 2) ───────────────────────────────────────
// The ZATCA private key/CSID secrets are encrypted at rest with this key ring. Defaulting to a
// path under ContentRootPath is fine for local dev (this exact directory never moves), but is a
// real production hazard: most deploy processes re-clone or recreate the app directory on every
// release, silently destroying this folder and permanently bricking every already-onboarded
// branch's stored ZATCA credentials (decrypt fails with a CryptographicException, invoices get
// stuck "pending" with no error detail, and the branch needs the entire CSR/OTP/CSID onboarding
// re-run — which should be a one-time-ever step, not a per-deploy chore). Set "ZatcaKeysPath" in
// appsettings/environment to an absolute path OUTSIDE the deploy directory in any real deployment
// (e.g. a mounted persistent volume) so this key ring survives every future redeploy.
var zatcaKeysPath = builder.Configuration["ZatcaKeysPath"] is { Length: > 0 } configuredPath
    ? configuredPath
    : Path.Combine(builder.Environment.ContentRootPath, "zatca-keys");
builder.Services.AddDataProtection()
    .SetApplicationName("BaqalaPOS")
    .PersistKeysToFileSystem(new DirectoryInfo(zatcaKeysPath));
builder.Services.AddHttpClient<IZatcaApiClient, ZatcaApiClient>();
builder.Services.AddScoped<IZatcaCsrService, ZatcaCsrService>();
builder.Services.AddScoped<IZatcaService, ZatcaService>();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi();

// ─── JWT authentication ──────────────────────────────────────────────────────
// Populates HttpContext.User from the same bearer token AuthController.GenerateJwt
// issues, so controllers can read the caller's role/branchId claims. A global
// fallback policy (below) requires a valid token on every endpoint except those
// explicitly marked [AllowAnonymous] (currently only /api/auth/login).
var jwtSection = builder.Configuration.GetSection("Jwt");
var jwtKey = jwtSection["Key"]
    ?? (builder.Environment.IsDevelopment()
        ? "dev-only-insecure-fallback-key-do-not-use-in-production-32b"
        : throw new InvalidOperationException("Jwt:Key must be configured outside Development."));
var jwtIssuer = jwtSection["Issuer"];
var jwtAudience = jwtSection["Audience"];

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        // Without this, ASP.NET Core silently renames short inbound claim types to long
        // ClaimTypes.* URIs (a well-known JwtBearer default) — e.g. the "role" claim
        // AuthController issues becomes unreadable via User.FindFirst("role"), which is
        // exactly how every RequirePermissionAttribute/GetCallerContext check in this API
        // reads it. Left enabled, role != "tenant_admin" is always true (role reads as
        // null), so every "skip this check for tenant_admin" and every branch-scoping
        // override silently never fires for anyone, admin or not.
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = !string.IsNullOrEmpty(jwtIssuer),
            ValidIssuer = jwtIssuer,
            ValidateAudience = !string.IsNullOrEmpty(jwtAudience),
            ValidAudience = jwtAudience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(2),
        };
    });
builder.Services.AddAuthorization(options =>
{
    // Every endpoint requires a valid bearer token unless marked [AllowAnonymous].
    // Per-module/action permission checks are layered on top via [RequirePermission]
    // on individual write endpoints (api/Authorization/RequirePermissionAttribute.cs).
    options.FallbackPolicy = new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
});

var app = builder.Build();

// ─── Auto-migrate on startup (development only) ───────────────────────────────
if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<BaqalaDbContext>();
    var startupLogger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    try
    {
        db.Database.Migrate();
    }
    catch (InvalidCastException lockEx) when (lockEx.StackTrace?.Contains("AcquireDatabaseLock") == true)
    {
        // MariaDB returns NULL for GET_LOCK() in some versions — known bug in
        // MySql.EntityFrameworkCore. Safe to ignore: migrations were applied manually.
        startupLogger.LogWarning("Skipping migration lock check (MariaDB GET_LOCK compatibility issue).");
    }
    catch (Exception migEx)
    {
        startupLogger.LogError(migEx, "Database migration failed — check migration SQL and schema.");
    }
    await DataSeeder.SeedAsync(db);
    await RenameRoles(db);
    await RenamePermissionModules(db);
    await DataSeeder.EnsurePermissionsAsync(db);
    await DataSeeder.PatchPermissionsAsync(db);
    await DataSeeder.PatchMarketingPermissionsAsync(db);
    await DataSeeder.PatchDiscountEligibilityAsync(db);
    await DataSeeder.PatchWarehouseRegionsAsync(db);
    await DataSeeder.PatchRemoveTestBranchesAsync(db);
    await DataSeeder.PatchRemoveNonCashierShiftsAsync(db);
    await DataSeeder.PatchCloseDuplicateOpenShiftsAsync(db);
    await DataSeeder.PatchCloseLegacyDemoShiftsAsync(db);
    await DataSeeder.PatchBackfillShiftCheckInsAsync(db);
    await DataSeeder.PatchRemoveEmptyOrdersAsync(db);
    await DataSeeder.PatchRemoveQaTestDataAsync(db);
    await DataSeeder.PatchRemoveBootstrapAuditNoiseAsync(db);
    await DataSeeder.PatchBackfillEmptyAuditSeverityAsync(db);
    await DataSeeder.PatchTrimExportAuditNoiseAsync(db);
    await DataSeeder.PatchBackfillMissingOrderTaxAsync(db);
    await DataSeeder.PatchBackfillShiftRollupsAsync(db);
    await DataSeeder.PatchEnsureFreshDemoDataAsync(db);
    app.MapOpenApi();
}

// ─── One-time role rename (old seeded names → product names) ─────────────────
static async Task RenameRoles(BaqalaDbContext db)
{
    var renames = new Dictionary<string, string>
    {
        ["Tenant Administrator"] = "Admin",
        ["Branch Manager"]       = "Manager",
        ["Storekeeper"]          = "Inventory Staff",
        ["Supervisor"]           = "Supervisor",   // keep
        ["Finance User"]         = "Accountant",
        ["Marketing User"]       = "Auditor",
        ["Picker"]               = "Warehouse Staff",
    };
    bool changed = false;
    foreach (var (oldName, newName) in renames)
    {
        if (oldName == newName) continue;
        var role = await db.Roles.FirstOrDefaultAsync(r => r.Name == oldName);
        if (role is not null && role.Name != newName) { role.Name = newName; changed = true; }
    }
    if (changed) await db.SaveChangesAsync();
}

// ─── One-time permission module rename (old names → product names) ────────────
static async Task RenamePermissionModules(BaqalaDbContext db)
{
    var renames = new Dictionary<string, string>
    {
        ["Finance"] = "Accounting & Finance",
    };
    bool changed = false;
    foreach (var (oldName, newName) in renames)
    {
        var rows = db.RolePermissions.Where(p => p.Module == oldName).ToList();
        foreach (var row in rows) { row.Module = newName; changed = true; }
    }
    if (changed) await db.SaveChangesAsync();
}

// ─── HTTPS enforcement (non-dev only — local dev cert makes this redirect-loop
// prone against the http:// fallback the frontend uses when VITE_API_URL isn't set) ──
if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

// ─── Global exception handler (FRD §5.5: "no technical stack trace in UI") ──────
// ASP.NET Core's Development-mode default (the Developer Exception Page) returns the
// full exception including stack trace as the response body, which frontend toasts
// were displaying verbatim. Log the full exception server-side; return a short,
// reference-tagged message to the client in every environment.
app.UseExceptionHandler(handler =>
{
    handler.Run(async context =>
    {
        var feature = context.Features.Get<IExceptionHandlerFeature>();
        var referenceId = Guid.NewGuid().ToString()[..8];
        if (feature?.Error is { } ex)
        {
            context.RequestServices.GetRequiredService<ILogger<Program>>()
                .LogError(ex, "Unhandled exception [{ReferenceId}] on {Path}", referenceId, feature.Path);
        }

        // This branch is a separate mini-pipeline that does NOT include CorsMiddleware
        // (UseExceptionHandler re-executes only the delegate given here, not the rest of
        // the app pipeline), and context.Response.Clear() above already wiped any CORS
        // headers CorsMiddleware had written before the exception was thrown. Without
        // this, every unhandled 500 shows up in the browser as a CORS failure
        // (net::ERR_FAILED, no Access-Control-Allow-Origin) instead of a readable error,
        // since the browser can't read a cross-origin response missing those headers.
        var origin = context.Request.Headers.Origin.ToString();
        if (!string.IsNullOrEmpty(origin))
        {
            context.Response.Headers["Access-Control-Allow-Origin"] = origin;
            context.Response.Headers["Access-Control-Allow-Credentials"] = "true";
            context.Response.Headers["Vary"] = "Origin";
        }

        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsJsonAsync(new
        {
            message = $"Something went wrong on our end. Reference: {referenceId}",
            referenceId,
        });
    });
});

app.UseCors("FrontendPolicy");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
