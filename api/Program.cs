using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.IdentityModel.Tokens;
using System.Linq;
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
builder.Services.AddScoped<IStockAlertService, StockAlertService>();
builder.Services.AddScoped<IBatchConsumptionService, BatchConsumptionService>();
builder.Services.AddScoped<IPriceResolutionService, PriceResolutionService>();
builder.Services.AddScoped<IStockMovementService, StockMovementService>();
builder.Services.AddScoped<IOrderVoidService, OrderVoidService>();
builder.Services.AddScoped<IProductDeletionService, ProductDeletionService>();
builder.Services.AddScoped<IDiscountCreationService, DiscountCreationService>();
builder.Services.AddScoped<IOfferCreationService, OfferCreationService>();
builder.Services.AddScoped<ICouponCreationService, CouponCreationService>();
builder.Services.AddHostedService<OperationalAlertsService>();
builder.Services.AddHostedService<UsbPrinterAutoInstallService>();
builder.Services.AddHostedService<LoyaltyExpiryService>();

// ─── ZATCA (Saudi e-invoicing Phase 2) ───────────────────────────────────────
// The ZATCA private key/CSID secrets are encrypted at rest with this key ring. It used to persist
// to a file under ContentRootPath — fine for local dev (this exact directory never moves), but a
// real production hazard: most deploy processes re-clone or recreate the app directory on every
// release, silently destroying that folder and permanently bricking every already-onboarded
// branch's stored ZATCA credentials (decrypt fails with a CryptographicException, invoices get
// stuck "pending" with no visible error, and the branch needs the entire CSR/OTP/CSID onboarding
// re-run — which should be a one-time-ever step, not a per-deploy chore). Persisting to this same
// database instead removes the failure mode entirely: the database already survives every
// redeploy by construction, unlike a file sitting in the deploy directory.
builder.Services.AddDataProtection()
    .SetApplicationName("BaqalaPOS")
    .PersistKeysToDbContext<BaqalaDbContext>();
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

// ─── Auto-migrate on startup (all environments) ───────────────────────────────
// Must run regardless of IsDevelopment(): the GitLab CI pipeline's separate `migrate.sh` step
// was removed from .gitlab-ci.yml the same day this bypass landed, on the assumption the app
// would now self-migrate in production — but this block used to be gated behind
// IsDevelopment(), so on the live (Production-environment) server nothing applied migrations
// at all, and the missing-tobacco_fee_amount/created_by error kept recurring even after the
// fix migration and this bypass were both deployed. Pulled out of the dev-only block below so
// it always runs; the demo-data seeders/patches stay dev-only.
using (var migrationScope = app.Services.CreateScope())
{
    var db = migrationScope.ServiceProvider.GetRequiredService<BaqalaDbContext>();
    var startupLogger = migrationScope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    string? attemptingMigrationId = null;
    try
    {
        var pending = (await db.Database.GetPendingMigrationsAsync()).ToList();
        if (pending.Count > 0)
        {
            // db.Database.Migrate() would normally apply these, but doing so first acquires an
            // exclusive lock via MariaDB's GET_LOCK() — which returns NULL on this server instead
            // of the expected integer, a documented MySql.EntityFrameworkCore incompatibility. The
            // library can't parse that NULL and throws InvalidCastException *before running any
            // migration SQL at all*. This used to be caught and silently ignored on the (false)
            // assumption that migrations must have been applied some other way — in reality every
            // migration since whenever that assumption was written has been silently skipped, and
            // the app has been running against a stale schema until each gap was eventually
            // noticed and patched by hand (see git history for this block).
            //
            // Generate the plain (non-idempotent) SQL for each pending migration individually and
            // execute it directly instead, which is what Migrate() does internally minus the broken
            // lock acquisition. This must walk migrations one at a time rather than generating one
            // script from "the last applied migration" to the end: migration IDs are timestamps, and
            // this codebase has repeatedly merged/authored migrations out of chronological order
            // (e.g. BackfillTobaccoFeeAndPoCreatedByColumns is dated before
            // FixMissingTobaccoFeeAndCreatedByColumns but was added to the repo after it already
            // ran). A single from-last-applied-to-null script silently drops any pending migration
            // whose ID sorts earlier than one already applied — GenerateScript slices the full
            // ordered migration list by position, not by "not yet applied" — which is exactly how
            // three migrations (AddIsTobaccoToProducts, AddOrderClientRequestId,
            // BackfillTobaccoFeeAndPoCreatedByColumns) ended up permanently stuck pending on this
            // dev database despite this same startup code running on every restart. Skipping the
            // lock is safe here — this app only ever migrates from a single instance at startup,
            // never multiple replicas racing to migrate concurrently.
            var applied = (await db.Database.GetAppliedMigrationsAsync()).ToHashSet();
            var orderedMigrations = applied.Concat(pending).OrderBy(id => id, StringComparer.Ordinal);
            var migrator = db.GetInfrastructure().GetRequiredService<Microsoft.EntityFrameworkCore.Migrations.IMigrator>();
            var checkpoint = Microsoft.EntityFrameworkCore.Migrations.Migration.InitialDatabase;
            startupLogger.LogInformation("Applying {Count} pending migration(s) directly (bypassing MariaDB's broken migration lock): {Migrations}",
                pending.Count, string.Join(", ", pending));
            foreach (var migrationId in orderedMigrations)
            {
                if (applied.Contains(migrationId))
                {
                    checkpoint = migrationId;
                    continue;
                }
                attemptingMigrationId = migrationId;
                var script = migrator.GenerateScript(checkpoint, migrationId);
                await db.Database.ExecuteSqlRawAsync(script);
                checkpoint = migrationId;
            }
        }
    }
    catch (Exception migEx)
    {
        startupLogger.LogError(migEx, "Database migration failed — check migration SQL and schema.");
        // No SSH/log access to the live server during the outage that made this necessary — surface
        // the failure via the authenticated /api/diagnostics/migrations endpoint instead. Remove
        // once migrations are confirmed stable again.
        BaqalaPOS.Api.Diagnostics.MigrationStartupStatus.LastErrorMigration = attemptingMigrationId;
        BaqalaPOS.Api.Diagnostics.MigrationStartupStatus.LastErrorMessage = migEx.ToString();
    }
}

if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<BaqalaDbContext>();
    await DataSeeder.SeedAsync(db);
    await RenameRoles(db);
    await RenamePermissionModules(db);
    await DataSeeder.EnsurePermissionsAsync(db);
    await DataSeeder.PatchPermissionsAsync(db);
    await DataSeeder.PatchPickerStockTransfersPermissionsAsync(db);
    await DataSeeder.PatchMarketingPermissionsAsync(db);
    await DataSeeder.PatchApprovalCenterPermissionsAsync(db);
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
    await DataSeeder.PatchBackfillEmployeesFromUsersAsync(db);
    await DataSeeder.PatchSeedHrmOrgDataAsync(db);
    await DataSeeder.PatchSeedHrmEmployeeContractDefaultsAsync(db);
    await DataSeeder.PatchSeedHrmHolidaysAsync(db);
    await DataSeeder.PatchSeedHrmShiftsAsync(db);
    await DataSeeder.PatchSeedHrmAttendanceAsync(db);
    await DataSeeder.PatchSeedHrmLeaveDataAsync(db);
    await DataSeeder.PatchSeedHrmPayrollDataAsync(db);
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
            BaqalaPOS.Api.Diagnostics.RecentErrors.Record(referenceId, feature.Path, ex);
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

// A kiosk device credential (KioskAuthController) is a valid authenticated bearer token, so
// without this it could reach any endpoint that relies only on the global fallback policy
// below and has no [RequirePermission] of its own — e.g. GET /api/users, which returns staff
// PII to anyone merely "authenticated". A device credential is far easier to extract from a
// physical kiosk than a staff password is to phish, so it gets its own explicit allowlist on
// top of the normal permission system rather than inheriting "any authenticated user" access.
app.Use(async (context, next) =>
{
    if (context.User.FindFirst("role")?.Value == "kiosk")
    {
        var path = context.Request.Path.Value ?? "";
        var method = context.Request.Method;
        var allowed =
            (method == "GET" && path.StartsWith("/api/products")) ||
            // The kiosk must price a basket exactly as the staffed till does. Without this the
            // kiosk's resolve call 403s, its price map falls back to Product.BasePrice, and a
            // branch/tier/scheduled price would apply at the till but not at the lane — a silent,
            // customer-facing disagreement. Read-only, and PricingController.Resolve scopes a
            // non-tenant_admin caller to its own branch regardless of the branchId it asks for.
            // Note this is the *resolve* endpoint only; /api/pricing/lists (rule admin) stays denied.
            (method == "GET" && path.StartsWith("/api/pricing/resolve")) ||
            (method == "GET" && path.StartsWith("/api/finance/coupons/validate/")) ||
            (method == "GET" && path.StartsWith("/api/finance/tax-rules")) ||
            (method == "GET" && path.StartsWith("/api/discounts")) ||
            (method == "GET" && path.StartsWith("/api/offers")) ||
            (method == "GET" && path.StartsWith("/api/compliance/zatca/settings/")) ||
            (method == "GET" && path.StartsWith("/api/customers/by-phone/")) ||
            (method == "POST" && path == "/api/customers") ||
            // Lets the kiosk gate its own fullscreen lockdown without any staff-only data
            // exposure — the endpoint only ever answers true/false against its own terminal.
            (method == "POST" && path == "/api/kiosk/verify-lockdown-pin") ||
            (method == "GET" && path == "/api/kiosk/lockdown-pin-info") ||
            (method == "POST" && path == "/api/orders");

        if (!allowed)
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await context.Response.WriteAsJsonAsync(new { message = "This kiosk credential cannot access this endpoint." });
            return;
        }
    }
    await next();
});

app.UseAuthorization();
app.MapControllers();

app.Run();
