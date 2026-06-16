using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace BaqalaPOS.Api.Models;

[Table("terminals")]
public class Terminal
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(50), Column("terminal_code")]
    public string TerminalCode { get; set; } = default!;

    [Required, MaxLength(255), Column("name")]
    public string Name { get; set; } = default!;

    [Required, Column("branch_id")]
    public Guid BranchId { get; set; }

    [Column("assigned_cashier_id")]
    public Guid? AssignedCashierId { get; set; }

    // active | offline | syncing | session_open | session_closed
    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "offline";

    [Column("last_sync")]
    public DateTime? LastSync { get; set; }

    [Column("uptime_minutes")]
    public int UptimeMinutes { get; set; } = 0;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Branch Branch { get; set; } = default!;
    public User? AssignedCashier { get; set; }
    [JsonIgnore] public ICollection<Device> Devices { get; set; } = [];
    [JsonIgnore] public ICollection<CashierShift> Shifts { get; set; } = [];
}

[Table("devices")]
public class Device
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(255), Column("device_name")]
    public string DeviceName { get; set; } = default!;

    // pos_terminal | barcode_scanner | printer | cash_drawer | scale | tablet | kiosk | handheld
    [Required, MaxLength(30), Column("device_type")]
    public string DeviceType { get; set; } = default!;

    [MaxLength(100), Column("serial_number")]
    public string? SerialNumber { get; set; }

    [Required, Column("branch_id")]
    public Guid BranchId { get; set; }

    [Column("terminal_id")]
    public Guid? TerminalId { get; set; }

    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "active"; // active | offline | maintenance

    [Required, MaxLength(20), Column("sync_status")]
    public string SyncStatus { get; set; } = "synced"; // synced | pending | failed

    [MaxLength(255), Column("behaviour_profile")]
    public string? BehaviourProfile { get; set; }

    [Column("last_activity")]
    public DateTime? LastActivity { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Branch Branch { get; set; } = default!;
    public Terminal? Terminal { get; set; }
}
