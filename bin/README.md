# bin/

One-off, dev-only scripts. These are not part of the shipped application
and are not the framework-bootstrapped console commands under
`app/Cli/Commands` (those go through `symfony/console` and full app
bootstrap — the wrong tool for a throwaway script).

Currently: PHP→JS migration characterization scripts (see
`docs/php-to-js-migration/`). Each dumps the real behavior of one PHP
function/class to a "golden" JSON fixture under `golden/`, which the
corresponding JS port's parity tests are checked against. Run by hand
when generating or regenerating a fixture — not part of `composer ci`,
and deliberately excluded from `phpcs`/`phpstan` (both are scoped to
`index.php app tests`, which doesn't include `bin/`).

Run with `php bin/<script>.php` after `composer install`.
