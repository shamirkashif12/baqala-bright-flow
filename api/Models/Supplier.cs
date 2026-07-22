using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BaqalaPOS.Api.Models;

[Table("suppliers")]
public class Supplier
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [MaxLength(50), Column("supplier_code")]
    public string SupplierCode { get; set; } = "";

    [Required, MaxLength(255), Column("name")]
    public string Name { get; set; } = default!;

    [MaxLength(255), Column("warehouse_name")]
    public string? WarehouseName { get; set; }

    [MaxLength(255), Column("contact_person")]
    public string? ContactPerson { get; set; }

    [MaxLength(50), Column("contact_number")]
    public string? ContactNumber { get; set; }

    [MaxLength(255), Column("email")]
    public string? Email { get; set; }

    [Column("address")]
    public string? Address { get; set; }

    [MaxLength(100), Column("city")]
    public string? City { get; set; }

    [Required, MaxLength(20), Column("supply_type")]
    public string SupplyType { get; set; } = "warehouse"; // warehouse | mart_to_mart | both

    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "active";

    [Column("last_supply_date")]
    public DateTime? LastSupplyDate { get; set; }

    // ── Supplier profile fields ─────────────────────────────────────────────
    // Registered legal business name, if different from the display Name.
    [MaxLength(255), Column("legal_name")]
    public string? LegalName { get; set; }

    [MaxLength(50), Column("cr_number")]
    public string? CrNumber { get; set; }

    [MaxLength(50), Column("vat_number")]
    public string? VatNumber { get; set; }

    // Business category (e.g. Food & Beverage, Tobacco, Packaging, General Goods) — distinct
    // from SupplyType above, which is a logistics routing flag (warehouse/mart_to_mart/both).
    [MaxLength(100), Column("category")]
    public string? Category { get; set; }

    [MaxLength(100), Column("payment_terms")]
    public string? PaymentTerms { get; set; }

    [Column("credit_limit", TypeName = "decimal(18,2)")]
    public decimal? CreditLimit { get; set; }

    [MaxLength(255), Column("bank_name")]
    public string? BankName { get; set; }

    [MaxLength(255), Column("bank_account_holder")]
    public string? BankAccountHolder { get; set; }

    [MaxLength(100), Column("bank_account_number")]
    public string? BankAccountNumber { get; set; }

    [MaxLength(50), Column("bank_iban")]
    public string? BankIban { get; set; }

    [Column("notes", TypeName = "longtext")]
    public string? Notes { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public ICollection<InventoryBatch> Batches { get; set; } = [];
    public ICollection<WarehouseRequest> WarehouseRequests { get; set; } = [];
    public ICollection<SupplierDocument> Documents { get; set; } = [];
}
