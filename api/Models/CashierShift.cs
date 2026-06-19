using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace BaqalaPOS.Api.Models;

[Table("cashier_shifts")]
public class CashierShift
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("cashier_id")]
    public Guid CashierId { get; set; }

    [Column("terminal_id")]
    public Guid? TerminalId { get; set; }

    [Required, Column("branch_id")]
    public Guid BranchId { get; set; }

    [Column("opening_amount")]
    public decimal OpeningAmount { get; set; }

    [Column("closing_amount")]
    public decimal? ClosingAmount { get; set; }

    [Column("cash_sales")]
    public decimal CashSales { get; set; } = 0;

    [Column("card_sales")]
    public decimal CardSales { get; set; } = 0;

    [Column("digital_sales")]
    public decimal DigitalSales { get; set; } = 0;

    [Column("total_sales")]
    public decimal TotalSales { get; set; } = 0;

    [Column("variance")]
    public decimal? Variance { get; set; }

    [Required, MaxLength(10), Column("status")]
    public string Status { get; set; } = "open"; // open | closed

    [Column("opened_at")]
    public DateTime OpenedAt { get; set; } = DateTime.UtcNow;

    [Column("closed_at")]
    public DateTime? ClosedAt { get; set; }

    [Column("notes")]
    public string? Notes { get; set; }

    // Navigation
    public User? Cashier { get; set; }
    public Terminal? Terminal { get; set; }
    public Branch? Branch { get; set; }
    [JsonIgnore] public ICollection<ShiftCashMovement> CashMovements { get; set; } = [];
    [JsonIgnore] public ICollection<Order> Orders { get; set; } = [];
}

[Table("shift_cash_movements")]
public class ShiftCashMovement
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("shift_id")]
    public Guid ShiftId { get; set; }

    [Required, MaxLength(10), Column("type")]
    public string Type { get; set; } = default!; // cash_in | cash_out

    [Column("amount")]
    public decimal Amount { get; set; }

    [Required, MaxLength(500), Column("reason")]
    public string Reason { get; set; } = default!;

    [Required, Column("recorded_by")]
    public Guid RecordedBy { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    [JsonIgnore] public CashierShift? Shift { get; set; }
    public User? RecordedByUser { get; set; }
}
