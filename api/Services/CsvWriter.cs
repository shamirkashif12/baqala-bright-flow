using System.Text;

namespace BaqalaPOS.Api.Services;

/// <summary>UTF-8 (with BOM, for Excel/Arabic compatibility) CSV writer used by report exports.</summary>
public static class CsvWriter
{
    public static byte[] Write(string[] headers, IEnumerable<object?[]> rows, string? companyHeader = null)
    {
        var sb = new StringBuilder();
        if (!string.IsNullOrWhiteSpace(companyHeader))
        {
            sb.AppendLine(Escape(companyHeader));
            sb.AppendLine();
        }
        sb.AppendLine(string.Join(",", headers.Select(Escape)));
        foreach (var row in rows)
        {
            sb.AppendLine(string.Join(",", row.Select(v => Escape(Format(v)))));
        }
        var preamble = Encoding.UTF8.GetPreamble();
        var body = Encoding.UTF8.GetBytes(sb.ToString());
        var result = new byte[preamble.Length + body.Length];
        Buffer.BlockCopy(preamble, 0, result, 0, preamble.Length);
        Buffer.BlockCopy(body, 0, result, preamble.Length, body.Length);
        return result;
    }

    private static string Format(object? value) => value switch
    {
        null => "",
        decimal d => d.ToString("0.####"),
        DateTime dt => dt.ToString("yyyy-MM-dd HH:mm"),
        _ => value.ToString() ?? "",
    };

    private static string Escape(string value)
    {
        if (value.Contains(',') || value.Contains('"') || value.Contains('\n') || value.Contains('\r'))
        {
            return $"\"{value.Replace("\"", "\"\"")}\"";
        }
        return value;
    }
}
