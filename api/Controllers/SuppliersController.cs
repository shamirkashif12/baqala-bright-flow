using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SuppliersController(BaqalaDbContext db, IAuditService audit) : ControllerBase
{
    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value, out var id) ? id : null;

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? status, [FromQuery] string? supplyType)
    {
        var query = db.Suppliers.AsQueryable();
        if (!string.IsNullOrEmpty(status)) query = query.Where(s => s.Status == status);
        if (!string.IsNullOrEmpty(supplyType)) query = query.Where(s => s.SupplyType == supplyType);
        return Ok(await query.OrderBy(s => s.Name).ToListAsync());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var supplier = await db.Suppliers.FindAsync(id);
        return supplier is null ? NotFound() : Ok(supplier);
    }

    // Required for NEW supplier registration only (Update intentionally stays unrestricted so
    // legacy suppliers missing these fields can still be edited without being forced to backfill
    // them first — same reasoning as the ef_required_server_generated_field lesson: don't
    // over-constrain via blanket model validation).
    private static string? ValidateRequiredForCreate(Supplier supplier)
    {
        if (string.IsNullOrWhiteSpace(supplier.Name)) return "Supplier name is required.";
        if (string.IsNullOrWhiteSpace(supplier.ContactPerson)) return "Contact person is required.";
        if (string.IsNullOrWhiteSpace(supplier.ContactNumber)) return "Phone number is required.";
        if (string.IsNullOrWhiteSpace(supplier.Address)) return "Address is required.";
        if (string.IsNullOrWhiteSpace(supplier.Category)) return "Supplier type/category is required.";
        if (string.IsNullOrWhiteSpace(supplier.CrNumber)) return "CR number is required.";
        if (string.IsNullOrWhiteSpace(supplier.VatNumber)) return "VAT number is required.";
        return null;
    }

    [RequirePermission("Suppliers", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Supplier supplier)
    {
        if (ValidateRequiredForCreate(supplier) is { } validationError) return BadRequest(new { message = validationError });

        supplier.Id = Guid.NewGuid();
        supplier.CreatedAt = supplier.UpdatedAt = DateTime.UtcNow;

        // Auto-generate supplier code: SUP-NNN
        var lastCode = await db.Suppliers
            .Where(s => s.SupplierCode.StartsWith("SUP-"))
            .OrderByDescending(s => s.SupplierCode)
            .Select(s => s.SupplierCode)
            .FirstOrDefaultAsync();
        int next = 1;
        if (lastCode is not null && int.TryParse(lastCode[4..], out int n)) next = n + 1;
        supplier.SupplierCode = $"SUP-{next:D3}";

        db.Suppliers.Add(supplier);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = supplier.Id }, supplier);
    }

    [RequirePermission("Suppliers", PermAction.Edit)]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] Supplier updated)
    {
        var supplier = await db.Suppliers.FindAsync(id);
        if (supplier is null) return NotFound();
        supplier.Name = updated.Name;
        supplier.WarehouseName = updated.WarehouseName;
        supplier.ContactPerson = updated.ContactPerson;
        supplier.ContactNumber = updated.ContactNumber;
        supplier.Email = updated.Email;
        supplier.Address = updated.Address;
        supplier.City = updated.City;
        supplier.SupplyType = updated.SupplyType;
        supplier.Status = updated.Status;
        supplier.LegalName = updated.LegalName;
        supplier.CrNumber = updated.CrNumber;
        supplier.VatNumber = updated.VatNumber;
        supplier.Category = updated.Category;
        supplier.PaymentTerms = updated.PaymentTerms;
        supplier.CreditLimit = updated.CreditLimit;
        supplier.BankName = updated.BankName;
        supplier.BankAccountHolder = updated.BankAccountHolder;
        supplier.BankAccountNumber = updated.BankAccountNumber;
        supplier.BankIban = updated.BankIban;
        supplier.Notes = updated.Notes;
        supplier.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(supplier);
    }

    [RequirePermission("Suppliers", PermAction.Delete)]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var supplier = await db.Suppliers.FindAsync(id);
        if (supplier is null) return NotFound();
        supplier.Status = "inactive";
        supplier.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return NoContent();
    }

    // ─── Legal documents (CR/VAT certificates, contracts, bank letters, etc.) ─────────────
    [HttpGet("{id:guid}/documents")]
    public async Task<IActionResult> GetDocuments(Guid id)
    {
        var documents = await db.SupplierDocuments.Where(d => d.SupplierId == id).OrderByDescending(d => d.UploadedAt).ToListAsync();
        return Ok(documents);
    }

    [RequirePermission("Suppliers", PermAction.Edit)]
    [HttpPost("{id:guid}/documents")]
    public async Task<IActionResult> UploadDocument(Guid id, [FromBody] SupplierDocument document)
    {
        var supplier = await db.Suppliers.FindAsync(id);
        if (supplier is null) return NotFound(new { message = "Supplier not found." });

        document.Id = Guid.NewGuid();
        document.SupplierId = id;
        document.UploadedBy = CallerId();
        document.UploadedAt = DateTime.UtcNow;
        db.SupplierDocuments.Add(document);
        await db.SaveChangesAsync();

        await audit.LogAsync(action: "Supplier document uploaded", entityType: "SupplierDocument", entityId: document.Id,
            userId: CallerId(), details: $"{document.DocumentType} for {supplier.Name}", module: "Suppliers");

        return CreatedAtAction(nameof(GetDocuments), new { id }, document);
    }

    [RequirePermission("Suppliers", PermAction.Delete)]
    [HttpDelete("{id:guid}/documents/{documentId:guid}")]
    public async Task<IActionResult> DeleteDocument(Guid id, Guid documentId)
    {
        var document = await db.SupplierDocuments.FirstOrDefaultAsync(d => d.Id == documentId && d.SupplierId == id);
        if (document is null) return NotFound();
        db.SupplierDocuments.Remove(document);
        await db.SaveChangesAsync();

        await audit.LogAsync(action: "Supplier document deleted", entityType: "SupplierDocument", entityId: documentId,
            userId: CallerId(), severity: "warning", module: "Suppliers");

        return NoContent();
    }
}
