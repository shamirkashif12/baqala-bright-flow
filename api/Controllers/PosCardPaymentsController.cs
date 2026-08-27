using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace BaqalaPOS.Api.Controllers;

// POS checkout card payments on the NamiPay terminal. The dialog flow is initiate → poll →
// (approved) reference the payment from POST /api/orders' payments[].posCardPaymentId, where it
// is verified server-side and linked to the sale — see OrdersController.Create and
// PosCardPaymentService. Branches without an enabled Nami integration get a 409
// {error:"not_configured"} from Initiate, which the POS treats as "record the card payment the
// old way" (standalone terminal).
[ApiController]
[Route("api/pos/card-payments")]
public class PosCardPaymentsController(IPosCardPaymentService payments) : ControllerBase
{
    public record InitiatePosCardPaymentRequest(Guid BranchId, decimal Amount);

    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value, out var id) ? id : null;

    // Whether this branch drives a real NamiPay terminal — the Take Payment dialog uses it to
    // show the terminal flow honestly (vs. the legacy "record a standalone-machine card payment"
    // path) instead of claiming a terminal is connected when none is configured.
    [HttpGet("availability")]
    public async Task<IActionResult> Availability([FromQuery] Guid branchId, CancellationToken ct) =>
        Ok(new { configured = await payments.IsConfiguredAsync(branchId, ct) });

    [RequirePermission("POS", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Initiate([FromBody] InitiatePosCardPaymentRequest req, CancellationToken ct)
    {
        var result = await payments.InitiateAsync(req.BranchId, req.Amount, CallerId(), ct);
        if (!result.Ok)
            return result.StatusCode == 409
                ? Conflict(new { error = "not_configured", message = result.Message })
                : StatusCode(result.StatusCode, new { message = result.Message });
        return Ok(result.Value);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetStatus(Guid id, CancellationToken ct)
    {
        var result = await payments.GetStatusAsync(id, ct);
        return result.Ok ? Ok(result.Value) : StatusCode(result.StatusCode, new { message = result.Message });
    }

    [RequirePermission("POS", PermAction.Create)]
    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id, CancellationToken ct)
    {
        var result = await payments.CancelAsync(id, CallerId(), ct);
        return result.Ok ? Ok(result.Value) : StatusCode(result.StatusCode, new { message = result.Message });
    }
}
