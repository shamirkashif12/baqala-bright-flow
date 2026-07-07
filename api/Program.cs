using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

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

// ─── ZATCA (Saudi e-invoicing Phase 2) ───────────────────────────────────────
builder.Services.AddDataProtection()
    .SetApplicationName("BaqalaPOS")
    .PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(builder.Environment.ContentRootPath, "zatca-keys")));
builder.Services.AddHttpClient<IZatcaApiClient, ZatcaApiClient>();
builder.Services.AddScoped<IZatcaCsrService, ZatcaCsrService>();
builder.Services.AddScoped<IZatcaService, ZatcaService>();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi();

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

app.UseCors("FrontendPolicy");
app.UseAuthorization();
app.MapControllers();

app.Run();
