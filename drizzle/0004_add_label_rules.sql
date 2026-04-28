-- Règles de catégorisation personnalisées du budget.
-- Crée quand l'utilisateur re-catégorise un libellé dans l'UI et souhaite
-- appliquer la règle aux futurs imports.
CREATE TABLE IF NOT EXISTS `label_rules` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `pattern` text NOT NULL,
  `match_type` text DEFAULT 'exact' NOT NULL,
  `category` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_label_rules_pattern` ON `label_rules` (`pattern`, `match_type`);
