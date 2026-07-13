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

    // Structured buyer address — required by ZATCA for Standard (B2B) invoices.
    [MaxLength(255), Column("buyer_street_name")]
    public string? BuyerStreetName { get; set; }

    [MaxLength(50), Column("buyer_building_number")]
    public string? BuyerBuildingNumber { get; set; }

    [MaxLength(255), Column("buyer_city_subdivision_name")]
    public string? BuyerCitySubdivisionName { get; set; }

    [MaxLength(100), Column("buyer_city_name")]
    public string? BuyerCityName { get; set; }

    [MaxLength(20), Column("buyer_postal_zone")]
    public string? BuyerPostalZone { get; set; }

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

    // ─── Structured postal address (ZATCA UBL requires discrete fields; Branch.Address is free text) ───
    [MaxLength(255), Column("street_name")]
    public string? StreetName { get; set; }

    [MaxLength(50), Column("building_number")]
    public string? BuildingNumber { get; set; }

    [MaxLength(255), Column("city_subdivision_name")]
    public string? CitySubdivisionName { get; set; }

    [MaxLength(20), Column("postal_zone")]
    public string? PostalZone { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public Branch? Branch { get; set; }
}

// One shared ZATCA cryptographic identity + invoice chain for the whole mart (all branches share
// one VAT registration and must sign under one certificate with one unbroken ICV/hash sequence —
// see SplitZatcaIdentityFromSettings migration). Singleton row, fixed PK, seeded by migration.
[Table("zatca_identity")]
public class ZatcaIdentity
{
    public static readonly Guid SingletonId = Guid.Parse("00000000-0000-0000-0000-000000000001");

    [Key, Column("id")]
    public Guid Id { get; set; } = SingletonId;

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

    // ─── ZATCA Onboarding State (encrypted at rest via IDataProtector) ────────
    [Column("csr")]
    public string? Csr { get; set; }

    [MaxLength(255), Column("egs_serial")]
    public string? EgsSerial { get; set; }

    [MaxLength(100), Column("ccsid_request_id")]
    public string? CcsidRequestId { get; set; }

    [Column("ccsid_binary_security_token")]
    public string? CcsidBinarySecurityToken { get; set; }

    [Column("ccsid_secret")]
    public string? CcsidSecret { get; set; }

    [MaxLength(100), Column("pcsid_request_id")]
    public string? PcsidRequestId { get; set; }

    [Column("pcsid_binary_security_token")]
    public string? PcsidBinarySecurityToken { get; set; }

    [Column("pcsid_secret")]
    public string? PcsidSecret { get; set; }

    [Column("last_icv")]
    public int LastIcv { get; set; } = 0;

    // Base64 SHA-256 of an empty string — ZATCA's well-known seed hash for a fresh device chain.
    [MaxLength(255), Column("last_invoice_hash")]
    public string LastInvoiceHash { get; set; } = "NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==";

    // not_started | csr_generated | compliance_csid_obtained | production_ready
    [MaxLength(50), Column("onboarding_status")]
    public string OnboardingStatus { get; set; } = "not_started";

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
