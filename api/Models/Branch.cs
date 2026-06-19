using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace BaqalaPOS.Api.Models;

[Table("branches")]
public class Branch
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [MaxLength(50), Column("branch_code")]
    public string? BranchCode { get; set; }

    [Required, MaxLength(255), Column("name")]
    public string Name { get; set; } = default!;

    [MaxLength(255), Column("name_ar")]
    public string? NameAr { get; set; }

    [Column("address")]
    public string? Address { get; set; }

    [MaxLength(100), Column("city")]
    public string? City { get; set; }

    [MaxLength(50), Column("contact_number")]
    public string? ContactNumber { get; set; }

    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "active"; // active | inactive | disabled

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation (ignored in JSON to prevent cycles and bloated responses)
    [JsonIgnore] public ICollection<User> Users { get; set; } = [];
    [JsonIgnore] public ICollection<Terminal> Terminals { get; set; } = [];
    [JsonIgnore] public ICollection<InventoryStock> InventoryStocks { get; set; } = [];
    [JsonIgnore] public ICollection<Order> Orders { get; set; } = [];
    [JsonIgnore] public ICollection<CashierShift> CashierShifts { get; set; } = [];
    [JsonIgnore] public ICollection<PosSettings> PosSettings { get; set; } = [];
}
