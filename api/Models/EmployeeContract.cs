using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BaqalaPOS.Api.Models;

[Table("employee_contracts")]
public class EmployeeContract
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("employee_id")]
    public Guid EmployeeId { get; set; }

    // Permanent | Temporary | Probation | Part-Time | Other
    [Required, MaxLength(30), Column("contract_type")]
    public string ContractType { get; set; } = default!;

    [Required, Column("start_date")]
    public DateOnly StartDate { get; set; }

    [Column("end_date")]
    public DateOnly? EndDate { get; set; }

    [Column("open_ended")]
    public bool OpenEnded { get; set; } = false;

    // active | expiring_soon | expired | terminated — expiring_soon/expired are computed on
    // read from EndDate; only "active"/"terminated" are ever persisted.
    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "active";

    [Column("file_name")]
    public string? FileName { get; set; }

    [Column("file_url", TypeName = "longtext")]
    public string? FileUrl { get; set; }

    [Column("uploaded_by")]
    public Guid? UploadedBy { get; set; }

    [Column("uploaded_at")]
    public DateTime UploadedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Employee? Employee { get; set; }
    public User? UploadedByUser { get; set; }
}
