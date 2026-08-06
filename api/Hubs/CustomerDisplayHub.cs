using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Text.Json;

namespace BaqalaPOS.Api.Hubs;

// Dumb relay for the POS Customer Display second-screen feature — holds no cart/order state of
// its own. The cashier's own checkout screen is the single source of truth for pricing; this hub
// only ever forwards whatever snapshot it was handed to every other connection paired to the same
// terminal. Every method re-validates the same three-layer authorization (logged-in → page
// permission → per-terminal branch/assignment scoping, see TerminalAccessCheck) on every call,
// since group membership by itself proves nothing about whether the caller is still allowed here
// (a terminal's assignment can change mid-session).
[Authorize]
public class CustomerDisplayHub(BaqalaDbContext db) : Hub
{
    private static string GroupName(Guid terminalId) => $"terminal:{terminalId}";

    // Called by both the cashier's checkout screen and the display page on connect and on every
    // reconnect. Throws (surfaced to the caller as a rejected invoke) when the caller isn't
    // allowed to pair with this terminal — the client must catch this and show the "restricted"
    // state rather than treating it as a transient failure.
    public async Task JoinTerminal(Guid terminalId)
    {
        var allowed = await TerminalAccessCheck.CanJoinTerminalAsync(Context.User!, db, terminalId);
        if (!allowed)
            throw new HubException("restricted");

        await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(terminalId));
    }

    // Cashier side only. Re-validates the same authorization as JoinTerminal (a terminal's
    // assignment can change mid-session) before relaying — never echoes back to the sender, since
    // the cashier's own screen already reflects whatever it just computed.
    public async Task PushCartSnapshot(Guid terminalId, JsonElement snapshot)
    {
        var allowed = await TerminalAccessCheck.CanJoinTerminalAsync(Context.User!, db, terminalId);
        if (!allowed)
            throw new HubException("restricted");

        await Clients.GroupExcept(GroupName(terminalId), Context.ConnectionId)
            .SendAsync("CartUpdated", snapshot);
    }

    // Optional per the spec — disconnecting already drops the connection from every group it was
    // in, so this only matters for a display explicitly switching which terminal it mirrors
    // without closing the socket.
    public async Task LeaveTerminal(Guid terminalId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupName(terminalId));
    }
}
