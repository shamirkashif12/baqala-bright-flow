using System.Text.Json;
using System.Text.Json.Serialization;

namespace BaqalaPOS.Api.Services;

/// <summary>
/// Ensures DateTime values read from MySQL (which EF returns as DateTimeKind.Unspecified)
/// are serialized with a "Z" suffix so clients know they are UTC.
/// Without this, JavaScript's new Date("2026-06-29T05:43:00") treats the value as local
/// time instead of UTC, causing times to appear off by the browser's UTC offset.
/// </summary>
public class UtcDateTimeConverter : JsonConverter<DateTime>
{
    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        => DateTime.SpecifyKind(reader.GetDateTime(), DateTimeKind.Utc);

    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options)
        => writer.WriteStringValue(DateTime.SpecifyKind(value, DateTimeKind.Utc));
}
