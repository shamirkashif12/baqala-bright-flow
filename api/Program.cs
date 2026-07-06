using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
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

builder.Services.AddScoped<IEmailService, SmtpEmailService>();
builder.Services.AddScoped<IAuditService, AuditService>();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi();

// ─── JWT authentication ──────────────────────────────────────────────────────
// Populates HttpContext.User from the same bearer token AuthController.GenerateJwt
// issues, so controllers can read the caller's role/branchId claims. A global
// fallback policy (below) requires a valid token on every endpoint except those
// explicitly marked [AllowAnonymous] (currently only /api/auth/login).
var jwtSection = builder.Configuration.GetSection("Jwt");
var jwtKey = jwtSection["Key"] ?? "dev-only-insecure-fallback-key-do-not-use-in-production-32b";
var jwtIssuer = jwtSection["Issuer"];
var jwtAudience = jwtSection["Audience"];

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
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
    catch (Exception migEx)
    {
        // Log the real error so migration failures are visible in the console.
        // EF's Migrate() is idempotent for already-applied migrations, so any
        // exception here is a genuine schema problem that needs attention.
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
    await DataSeeder.PatchRemoveEmptyOrdersAsync(db);
    await DataSeeder.PatchRemoveQaTestDataAsync(db);
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

app.UseCors("FrontendPolicy");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
