using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BaqalaPOS.Api.Models;

// FR-ADM-05: ZATCA Invoices and compliance screens
[Table("zatca_invoices")]
public class ZatcaInvoice
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("order_id")]
    public Guid OrderId { get; set; }

    [Required, Column("branch_id")]
    public Guid BranchId { get; set; }

    [MaxLength(100), Column("invoice_number")]
    public string? InvoiceNumber { get; set; }

    [Required, MaxLength(20), Column("invoice_type")]
    public string InvoiceType { get; set; } = "standard"; // standard | simplified | credit | debit

    [Column("issue_date")]
    public DateTime IssueDate { get; set; } = DateTime.UtcNow;

    [Column("supply_date")]
    public DateTime? SupplyDate { get; set; }

    [Column("total_amount")]
    public decimal TotalAmount { get; set; }

    [Column("tax_amount")]
    public decimal TaxAmount { get; set; }

    [Column("discount_amount")]
    public decimal DiscountAmount { get; set; } = 0;

    [MaxLength(255), Column("buyer_name")]
    public string? BuyerName { get; set; }

    [MaxLength(20), Column("buyer_vat_number")]
    public string? BuyerVatNumber { get; set; }

    [Column("qr_code_value")]
    public string? QrCodeValue { get; set; }

    [Column("xml_content")]
    public string? XmlContent { get; set; }

    // pending | submitted | accepted | rejected
    [Required, MaxLength(20), Column("zatca_status")]
    public string ZatcaStatus { get; set; } = "pending";

    [Column("zatca_response")]
    public string? ZatcaResponse { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Order? Order { get; set; }
    public Branch? Branch { get; set; }
}

[Table("zatca_settings")]
public class ZatcaSettings
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("branch_id")]
    public Guid BranchId { get; set; }

    [MaxLength(20), Column("vat_registration_number")]
    public string? VatRegistrationNumber { get; set; }

    [MaxLength(500), Column("seller_name")]
    public string? SellerName { get; set; }

    [Column("csid")]
    public string? Csid { get; set; }

    [Column("private_key")]
    public string? PrivateKey { get; set; }

    [Column("compliance_check_invoice_id")]
    public string? ComplianceCheckInvoiceId { get; set; }

    [Column("phase2_enabled")]
    public bool Phase2Enabled { get; set; } = false;

    [MaxLength(50), Column("environment")]
    public string Environment { get; set; } = "sandbox"; // sandbox | production

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public Branch? Branch { get; set; }
}
