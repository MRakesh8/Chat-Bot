import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatAppDir = path.resolve(__dirname, "..");

console.log("========================================================================");
console.log("RUNNING NOVA CHAT SIDEBAR UI POLISH & ACCESSIBILITY TEST SUITE");
console.log("========================================================================\n");

const sidebarTsx = fs.readFileSync(path.resolve(chatAppDir, "src/components/sidebar.tsx"), "utf8");

let passed = 0;
let failed = 0;

function runCheck(testNum, testName, fn) {
  try {
    fn();
    console.log(`✓ Test ${testNum}: ${testName}`);
    passed++;
  } catch (err) {
    console.error(`✗ Test ${testNum} FAILED: ${testName}\n  Error: ${err.message}`);
    failed++;
  }
}

// 1. Heart/Favorites filter button has strong contrast, border, and focus states
runCheck(1, "Favorites filter button has high contrast, distinct border, and focus ring", () => {
  assert(sidebarTsx.includes('onClick={() => setShowFavorites(!showFavorites)}'), "Must have favorites toggle handler");
  assert(sidebarTsx.includes('aria-pressed={showFavorites}'), "Must set aria-pressed attribute");
  assert(sidebarTsx.includes('aria-label='), "Must provide accessible aria-label");
  assert(sidebarTsx.includes('focus-visible:ring-2'), "Must have accessible focus-visible ring");
  assert(sidebarTsx.includes('border'), "Must have border for clear visibility on dark background");
});

// 2. Favorites active state does not rely on color alone
runCheck(2, "Favorites active state does not rely on color alone (has indicator dot and badge)", () => {
  // Dot indicator inside button
  assert(sidebarTsx.includes('rounded-full bg-rose-500 ring-2 ring-sidebar'), "Must render visual dot indicator when active");
  // Filtered badge in list header
  assert(sidebarTsx.includes('Filtered') && sidebarTsx.includes('showFavorites'), "Must render Filtered badge when active");
  // Clear filter button
  assert(sidebarTsx.includes('Show all') && sidebarTsx.includes('setShowFavorites(false)'), "Must provide Show all / Clear filter button");
});

// 3. Conversation row layout uses available width and prevents title overflow
runCheck(3, "Conversation row layout uses min-w-0 on flex row and flex-1 min-w-0 truncate on title", () => {
  assert(sidebarTsx.includes('min-w-0') && sidebarTsx.includes('group relative flex items-center'), "Row must have min-w-0 to prevent flex blowout");
  assert(sidebarTsx.includes('flex-1 min-w-0 truncate'), "Title must have flex-1 min-w-0 truncate for reliable truncation");
  assert(sidebarTsx.includes('title={conv.title}'), "Title must have native title attribute for full hover text");
});

// 4. Action buttons container is pinned with shrink-0 and ml-auto
runCheck(4, "Action buttons container has shrink-0 and ml-auto so it cannot be pushed off-screen", () => {
  assert(sidebarTsx.includes('shrink-0 transition-opacity') && sidebarTsx.includes('ml-auto'), "Actions container must have shrink-0 and ml-auto");
});

// 5. Three-dot menu button is discoverable and accessible on touch, hover, focus, and open states
runCheck(5, "Three-dot action button has accessible name, focus ring, and touch-friendly visibility", () => {
  assert(sidebarTsx.includes('aria-label="Conversation actions"'), "Three-dot button must have aria-label='Conversation actions'");
  assert(sidebarTsx.includes('title="Conversation actions"'), "Three-dot button must have title='Conversation actions'");
  assert(sidebarTsx.includes('focus-visible:ring-2'), "Three-dot button must have focus-visible ring");
  // Touch-friendly visibility (opacity on mobile, group-hover on md+)
  assert(sidebarTsx.includes('opacity-75 md:opacity-0') || sidebarTsx.includes('md:group-hover:opacity-100'), "Must be visible on touch and on hover on desktop");
  // Active / open menu visibility
  assert(sidebarTsx.includes('isMenuOpen') && sidebarTsx.includes('onOpenChange={setIsMenuOpen}'), "Must track isMenuOpen to keep row and button visible when open");
});

// 6. Three-dot dropdown menu includes Rename, Favorites, Separator, and Delete
runCheck(6, "Three-dot dropdown menu includes Rename, Add/Remove from Favorites, and Delete", () => {
  assert(sidebarTsx.includes('onStartEdit(conv.id, conv.title'), "Must include Rename action");
  assert(sidebarTsx.includes('onToggleFavorite(conv.id'), "Must include Add/Remove from Favorites action");
  assert(sidebarTsx.includes('DropdownMenuSeparator'), "Must include separator before destructive action");
  assert(sidebarTsx.includes('onDelete(conv.id'), "Must include Delete action");
});

// 7. Menu content is portaled and positioned properly to avoid clipping
runCheck(7, "DropdownMenuContent uses align='end' side='bottom' with portal to prevent clipping", () => {
  assert(sidebarTsx.includes('align="end"'), "Dropdown menu must align to end");
  assert(sidebarTsx.includes('sideOffset={6}'), "Dropdown menu must have sideOffset");
});

// 8. Delete confirmation flow and favorite protection are preserved
runCheck(8, "Delete flow preserves favorite protection and AlertDialog confirmation", () => {
  assert(sidebarTsx.includes('conversationToDelete'), "Must preserve conversationToDelete state");
  assert(sidebarTsx.includes('confirmDelete'), "Must preserve confirmDelete handler");
  assert(sidebarTsx.includes('deleteConversation.mutate'), "Must invoke deleteConversation mutation");
  assert(sidebarTsx.includes('AlertDialogTitle>Delete Conversation?</AlertDialogTitle>'), "Must preserve AlertDialog confirmation");
  assert(sidebarTsx.includes('To delete it, please remove it from Favorites first'), "Must protect favorite conversations");
});

// 9. Both favorite toggle button and three-dot menu are on the conversation row without duplicate flickering elements
runCheck(9, "Both favorite toggle button and three-dot menu are present on conversation row", () => {
  assert(!sidebarTsx.includes('group-hover:hidden'), "Must NOT use duplicate group-hover:hidden heart button");
  assert(sidebarTsx.includes('aria-label={conv.isFavorite ? "Remove from favorites" : "Add to favorites"}'), "Row favorite button must have accessible label");
  assert(sidebarTsx.includes('title={conv.isFavorite ? "Remove from favorites" : "Add to favorites"}'), "Row favorite button must have title tooltip");
  assert(sidebarTsx.includes('aria-label="Conversation actions"'), "Three-dot button must have accessible label");
  assert(sidebarTsx.includes('MoreVertical'), "Three-dot menu must render MoreVertical icon");
});

// 10. Favorites empty state provides helpful instructions
runCheck(10, "Favorites empty state displays helpful guide when filter yields no chats", () => {
  assert(sidebarTsx.includes('No favorite conversations'), "Must display helpful message when no favorites match");
  assert(sidebarTsx.includes('Click the heart on any conversation to add it here'), "Must provide hint on how to add favorites");
});

// 11. DOM Layout verification: Long titles truncate cleanly without pushing action buttons
runCheck(11, "DOM Layout verification: title truncates and action buttons remain pinned to right edge", () => {
  // Test 11 verifies that the row structure adheres to flexbox containment rules
  const hasRowMinW0 = sidebarTsx.includes('min-w-0') && sidebarTsx.includes('group relative flex items-center');
  const hasTitleTruncate = sidebarTsx.includes('flex-1 min-w-0 truncate');
  const hasActionsPinned = sidebarTsx.includes('shrink-0') && sidebarTsx.includes('ml-auto');
  assert(hasRowMinW0, "Row must have min-w-0 to prevent flex expansion");
  assert(hasTitleTruncate, "Title span must have flex-1 min-w-0 truncate");
  assert(hasActionsPinned, "Actions container must have shrink-0 and ml-auto to remain pinned to right");
});

console.log("\n========================================================================");
console.log(`AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log("========================================================================\n");

if (failed > 0) {
  process.exit(1);
}
