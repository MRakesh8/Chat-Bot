/**
 * Returns a time-appropriate greeting based on the specified date or current browser local time.
 *
 * Periods:
 *  - 5:00 AM–11:59 AM: "Good morning"
 *  - 12:00 PM–4:59 PM: "Good afternoon"
 *  - 5:00 PM–8:59 PM: "Good evening"
 *  - 9:00 PM–4:59 AM: "Good night"
 */
export function getLocalGreeting(date: Date = new Date()): string {
  const hour = date.getHours();

  if (hour >= 5 && hour < 12) {
    return "Good morning";
  }
  if (hour >= 12 && hour < 17) {
    return "Good afternoon";
  }
  if (hour >= 17 && hour < 21) {
    return "Good evening";
  }
  return "Good night";
}
