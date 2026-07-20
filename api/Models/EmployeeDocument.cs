using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BaqalaPOS.Api.Models;

[Table("employee_documents")]
public class EmployeeDocument
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("employee_id")]
    public Guid EmployeeId { get; set; }

    // Iqama / National ID | Passport | Health Certificate | Work Permit | Other
    [Required, MaxLength(50), Column("document_type")]
    public string DocumentType { get; set; } = default!;

    [Required, MaxLength(255), Column("file_name")]
    public string FileName { get; set; } = default!;

    // Base64 data-URL, same convention as Product.ImageUrl.
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
    public Employee? Employee { get; set; }
    public User? UploadedByUser { get; set; }
}
