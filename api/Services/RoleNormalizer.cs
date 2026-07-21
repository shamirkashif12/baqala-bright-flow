namespace BaqalaPOS.Api.Services;

// Maps a DB Role.Name to the short "AppRole" code used in JWT claims and frontend role checks.
// Moved out of AuthController (which generates the "role" claim at login) so other call sites —
// e.g. EmployeesController's salary-edit rank check — can normalize a target employee's assigned
// ACL role the same way, instead of re-implementing (and inevitably drifting from) this mapping.
public static class RoleNormalizer
{
    public static string ToAppRole(string roleName) => roleName switch
    {
        "Tenant Administrator" or "Admin"            => "tenant_admin",
        "Branch Manager"       or "Manager"          => "branch_manager",
        "Cashier"                                    => "cashier",
        "Storekeeper"          or "Inventory Staff"  => "storekeeper",
        "Supervisor"                                 => "supervisor",
        "Finance User"         or "Accountant"       => "finance_user",
        "Marketing User"                             => "marketing_user",
        "Picker"                                     => "picker",
        // Previously collapsed into marketing_user/picker respectively — two real, distinct
        // roles (with their own real permission rows) getting mislabeled as unrelated ones,
        // which silently broke every isManager/role-gated check for them and showed the wrong
        // label throughout the app (an Auditor's own dashboard called them a "Marketing User").
        "Auditor"                                    => "auditor",
        "Warehouse Staff"                             => "warehouse_staff",
        "Warehouse Manager"                          => "warehouse_manager",
        _                                            => roleName.ToLower().Replace(' ', '_')
    };
}

// Seniority ranking used ONLY to gate salary editing (SalaryComponent add/edit/delete) so a
// manager-tier role can't set the pay of a peer or more senior role. This is an additive
// safeguard, not something the FRD itself specifies — the FRD's own ACL model (section 3) is
// purely module-permission + branch scoped, with no rank concept. Requested on top of that.
public static class RoleRank
{
    private static readonly Dictionary<string, int> Levels = new()
    {
        ["tenant_admin"] = 100,
        ["branch_manager"] = 80,
        ["warehouse_manager"] = 80,
        ["supervisor"] = 60,
        ["finance_user"] = 50,
        ["auditor"] = 40,
        ["marketing_user"] = 20,
        ["cashier"] = 10,
        ["storekeeper"] = 10,
        ["picker"] = 10,
        ["warehouse_staff"] = 10,
    };

    // Unranked/unrecognized roles default to 0 — the lowest rank, so an unknown role never
    // outranks a recognized one but also never blocks a recognized editor from acting on it.
    public static int Of(string appRole) => Levels.GetValueOrDefault(appRole, 0);
}
