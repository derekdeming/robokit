# Theme Compatibility Audit

## Components to Check

### 1. Navigation Component (navigation.tsx)
- [x] Sidebar background: Uses `bg-background` (theme-aware ✓)
- [x] Nav items: Uses `text-muted-foreground`, `hover:text-foreground` (theme-aware ✓)
- [x] Active nav item: Uses `bg-primary text-primary-foreground` (theme-aware ✓)
- [x] User profile card: Uses `bg-card/50` with `border-border/50` (theme-aware ✓)
- [x] Bottom gradient: Uses `from-muted/30` (theme-aware ✓)
- [x] Text colors: Uses semantic colors (theme-aware ✓)

### 2. Enhanced Datasets Client (enhanced-datasets-client.tsx)
- [ ] Overview badges need explicit dark mode classes
- [ ] Search input needs verification
- [ ] Filter dropdowns need verification
- [ ] Dataset highlight ring needs verification

### 3. Dataset Card (dataset-card.tsx)
- [ ] View button needs consistent theming
- [ ] Delete button needs consistent theming
- [ ] Card background and borders
- [ ] Status indicators
- [ ] Error messages background

### 4. Jobs View (jobs-view.tsx)
- [ ] Tab buttons
- [ ] Job cards in grouped view
- [ ] Job status badges
- [ ] Expanded content backgrounds
- [ ] JSON viewer backgrounds

### 5. Settings Menu (settings-menu.tsx)
- [x] Button styling: Uses semantic colors (theme-aware ✓)
- [x] Dropdown content: Uses default theme-aware styles (✓)

## Issues Found & Fixes Needed

1. **Enhanced Datasets Client badges** - Using hard-coded colors that need dark mode variants
2. **Dataset Card buttons** - Using hard-coded colors that need adjustment
3. **Jobs View** - Some backgrounds using `/20` opacity that might not be visible enough in dark mode

## Semantic Color Classes (Theme-Aware)
✅ Good to use:
- `bg-background`, `bg-card`, `bg-popover`, `bg-muted`
- `text-foreground`, `text-muted-foreground`, `text-card-foreground`
- `border-border`, `border-input`
- `bg-primary`, `text-primary`, `text-primary-foreground`
- `bg-secondary`, `text-secondary`, `text-secondary-foreground`
- `bg-destructive`, `text-destructive`, `text-destructive-foreground`

❌ Avoid (use dark: variants):
- Direct color classes like `bg-gray-100`, `text-blue-700`
- Fixed opacity values without dark mode consideration