using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BaqalaPOS.Api.Models;

[Table("supplier_documents")]
public class SupplierDocument
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("supplier_id")]
    public Guid SupplierId { get; set; }

    // CR Certificate | VAT Certificate | Contract | Bank Letter | Other
    [Required, MaxLength(50), Column("document_type")]
    public string DocumentType { get; set; } = default!;

    [Required, MaxLength(255), Column("file_name")]
    public string FileName { get; set; } = default!;

    // Base64 data-URL, same convention as EmployeeDocument.FileUrl / Product.ImageUrl.
    [Required, Column("file_url", TypeName = "longtext")]
    public string FileUrl { get; set; } = default!;

    [Column("issue_date")]
    public DateOnly? IssueDate { get; set; }

    [Column("expiry_date")]
    public DateOnly? ExpiryDate { get; set; }

    [Column("uploaded_by")]
    public Guid? UploadedBy { get; set; }

    [Column("uploaded_at")]
    public DateTime UploadedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Supplier? Supplier { get; set; }
    public User? UploadedByUser { get; set; }
}
