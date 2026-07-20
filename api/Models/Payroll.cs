using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BaqalaPOS.Api.Models;

[Table("salary_components")]
public class SalaryComponent
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("employee_id")]
    public Guid EmployeeId { get; set; }

    [Required, MaxLength(100), Column("component_name")]
    public string ComponentName { get; set; } = default!;

    // Earning | Deduction
    [Required, MaxLength(20), Column("component_type")]
    public string ComponentType { get; set; } = default!;

    [Column("amount")]
    public decimal Amount { get; set; }

    [Required, MaxLength(20), Column("frequency")]
    public string Frequency { get; set; } = "Monthly";

    [Required, Column("effective_from")]
    public DateOnly EffectiveFrom { get; set; }

    [Column("effective_to")]
    public DateOnly? EffectiveTo { get; set; }

    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "active"; // active | inactive

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Employee? Employee { get; set; }
}

[Table("payroll_runs")]
public class PayrollRun
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("branch_id")]
    public Guid BranchId { get; set; }

    [Column("year")]
    public int Year { get; set; }

    [Column("month")]
    public int Month { get; set; }

    [Required, Column("pay_date")]
    public DateOnly PayDate { get; set; }

    // Draft | Processed | Locked | Cancelled
    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "Draft";

    [Column("employee_count")]
    public int EmployeeCount { get; set; }

    [Column("total_amount")]
    public decimal TotalAmount { get; set; }

    [Column("processed_by")]
    public Guid? ProcessedBy { get; set; }

    [Column("processed_at")]
    public DateTime? ProcessedAt { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Branch? Branch { get; set; }
    public User? ProcessedByUser { get; set; }
}

// Snapshot of an employee's net pay for a given run, computed from their SalaryComponents at
// process time — a run's numbers stay fixed even if the employee's components change later.
[Table("payroll_run_employees")]
public class PayrollRunEmployee
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("payroll_run_id")]
    public Guid PayrollRunId { get; set; }

    [Required, Column("employee_id")]
    public Guid EmployeeId { get; set; }

    [Column("basic_salary")]
    public decimal BasicSalary { get; set; }

    [Column("gross_earnings")]
    public decimal GrossEarnings { get; set; }

    [Column("total_deductions")]
    public decimal TotalDeductions { get; set; }

    [Column("net_payable")]
    public decimal NetPayable { get; set; }

    // Navigation
    public PayrollRun? PayrollRun { get; set; }
    public Employee? Employee { get; set; }
}
