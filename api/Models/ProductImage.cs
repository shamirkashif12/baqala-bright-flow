using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace BaqalaPOS.Api.Models;

// Additional, optional gallery images for a product — Product.ImageUrl remains the single
// "primary" image exactly as before. Mirrors SupplierDocument/EmployeeDocument's shape (this
// app's established multi-attachment pattern): base64 data-URL in a longtext column, no disk/CDN
// storage anywhere in this codebase.
[Table("product_images")]
public class ProductImage
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("product_id")]
    public Guid ProductId { get; set; }

    [Required, Column("file_url", TypeName = "longtext")]
    public string FileUrl { get; set; } = default!;

    [Column("sort_order")]
    public int SortOrder { get; set; } = 0;

    [Column("uploaded_by")]
    public Guid? UploadedBy { get; set; }

    [Column("uploaded_at")]
    public DateTime UploadedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    [JsonIgnore] public Product? Product { get; set; }
    public User? UploadedByUser { get; set; }
}
