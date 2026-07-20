using System.Collections.Concurrent;

namespace BaqalaPOS.Api.Diagnostics;

// Same rationale as MigrationStartupStatus: no SSH/log access to the live server, so the
// reference id shown in the "Something went wrong on our end. Reference: xxxxxxxx" toast
// (Program.cs global exception handler) was otherwise a dead end — there was no way to look up
// what actually threw. Keeps the last N unhandled exceptions in memory, keyed by reference id, so
// an authenticated diagnostic endpoint can report the real exception. Remove once this is no
// longer needed to chase down live 500s.
public static class RecentErrors
{
    private const int Capacity = 50;
    private static readonly ConcurrentQueue<Entry> Entries = new();

    public record Entry(string ReferenceId, string? Path, DateTime OccurredAt, string Exception);

    public static void Record(string referenceId, string? path, Exception ex)
    {
        Entries.Enqueue(new Entry(referenceId, path, DateTime.UtcNow, ex.ToString()));
        while (Entries.Count > Capacity) Entries.TryDequeue(out _);
    }

    public static Entry? Find(string referenceId) =>
        Entries.FirstOrDefault(e => e.ReferenceId == referenceId);

    public static IEnumerable<Entry> All() => Entries.OrderByDescending(e => e.OccurredAt);
}
