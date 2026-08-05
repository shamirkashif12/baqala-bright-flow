using System.Linq.Expressions;

namespace BaqalaPOS.Api.Data;

/// <summary>
/// SQL-side "IN" filtering for multi-select filters.
/// </summary>
/// <remarks>
/// The MySQL EF Core provider this repo uses cannot assign a type mapping to a *parameterized*
/// collection, so the obvious <c>query.Where(x =&gt; array.Contains(x.Col))</c> throws
/// <c>InvalidOperationException: Expression '@array' in the SQL tree does not have a type mapping
/// assigned</c> when the query is compiled. <see cref="EF.Constant{T}"/> does not help — the
/// provider fails to map the resulting <c>InExpression</c> either way.
///
/// The trap that makes this so easy to ship broken: a single-element array is silently fine,
/// because EF folds <c>arr.Contains(col)</c> down to a plain <c>=</c>. Only a 2+ value request
/// exercises the IN-list path, so a one-value smoke test of a new multi-select filter passes and
/// the filter still 500s in real use.
///
/// Most report builders in this codebase dodge it by materializing with <c>ToListAsync()</c> and
/// narrowing in memory. That is not always acceptable — where the query still has to group or
/// aggregate in SQL, pulling the rows client-side to filter them would be far more expensive.
/// This helper keeps the filter in SQL by expanding it to <c>col = v0 OR col = v1 OR ...</c>.
/// Each value becomes its own ordinary scalar parameter (the exact shape EF produces for
/// <c>x =&gt; x.Col == someLocal</c>), so every leaf gets a type mapping and nothing has to be
/// materialized.
/// </remarks>
public static class QueryableInExtensions
{
    /// <summary>
    /// Restricts <paramref name="source"/> to rows whose <paramref name="selector"/> value is one
    /// of <paramref name="values"/>. An empty <paramref name="values"/> means "no filter" and
    /// returns <paramref name="source"/> unchanged, matching the `if (x.Length > 0)` guard style
    /// used around every multi-select filter in the report controllers.
    /// </summary>
    public static IQueryable<TEntity> WhereIn<TEntity, TValue>(
        this IQueryable<TEntity> source,
        Expression<Func<TEntity, TValue>> selector,
        IReadOnlyCollection<TValue> values)
    {
        if (values.Count == 0) return source;

        Expression? body = null;
        foreach (var value in values)
        {
            // Constant-holding-a-box + member access, rather than Expression.Constant(value)
            // directly: this is the closure shape EF's parameter extraction recognises, so the
            // value is sent as a parameter with a proper type mapping instead of being written
            // into the SQL as a literal.
            var boxed = Expression.Property(
                Expression.Constant(new ValueBox<TValue>(value)),
                nameof(ValueBox<TValue>.Value));
            var equals = Expression.Equal(selector.Body, boxed);
            body = body is null ? equals : Expression.OrElse(body, equals);
        }

        return source.Where(Expression.Lambda<Func<TEntity, bool>>(body!, selector.Parameters[0]));
    }

    private sealed class ValueBox<T>(T value)
    {
        public T Value { get; } = value;
    }
}
