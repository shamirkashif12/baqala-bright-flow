// Lets the Help menu (mounted globally in the topbar) trigger a tour that's owned by
// whichever page defines it, without those two pieces needing a shared React context.
export const RESTART_DASHBOARD_TOUR_EVENT = "restart-dashboard-tour";

export function restartDashboardTour() {
  window.dispatchEvent(new CustomEvent(RESTART_DASHBOARD_TOUR_EVENT));
}
