# Local-dev PHP image for webtrees, matching the extensions in composer.json's
# require block. Runs the app the same way it's run natively throughout the
# php-to-js migration: the built-in `php -S` server from the repo root, no
# Apache/nginx. Code comes from a bind mount (see docker-compose.yml), not
# COPY, so this image only needs to provide the PHP runtime + extensions;
# vendor/ is expected to already exist on the host (run `composer install`
# there first, same as for native/non-Docker use).
FROM php:8.3-cli-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
        libicu-dev \
        libzip-dev \
        libpng-dev \
        libjpeg-dev \
        libfreetype6-dev \
        libonig-dev \
        libcurl4-openssl-dev \
        libsqlite3-dev \
        libpq-dev \
        unzip \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" \
        gd \
        intl \
        pdo_sqlite \
        pdo_pgsql \
        pdo_mysql \
        zip \
        mbstring \
        curl \
    # data/config.ini.php defaults to dbtype="sqlite" (pdo_sqlite); a
    # data/config.yaml written by setup-cli/ uses dbtype="pgsql"
    # (pdo_pgsql). pdo_mysql is here too so the browser setup wizard's
    # MySQL option works, and so every pdo_mysql.* ini directive it
    # reads actually exists — SetupWizard.php used to call
    # PhpService::pdoMysqlDefaultSocket() unconditionally for every
    # dbtype (fixed in app/Http/RequestHandlers/SetupWizard.php), which
    # crashed with "Cannot read PHP configuration: pdo_mysql.default_socket"
    # on any build missing this extension, even when picking Postgres.
    && rm -rf /var/lib/apt/lists/*

# This image loads no php.ini at all otherwise (php:*-cli-bookworm ships
# php.ini-development/-production as templates only, neither installed
# as php.ini), so PHP falls back to its compiled-in defaults -
# upload_max_filesize=2M, post_max_size=8M - far too small for a real
# GEDCOM export (reported live: importing a real family tree GEDCOM hit
# "The uploaded file exceeds the allowed size",
# app/Http/RequestHandlers/ImportGedcomAction.php:75, UPLOAD_ERR_INI_SIZE).
# post_max_size must be >= upload_max_filesize (PHP silently ignores the
# file and empties $_POST otherwise) - both raised together.
# memory_limit matches this repo's existing PHPUnit convention
# (`vendor/bin/phpunit -d memory_limit=512M`) - GEDCOM parsing is
# memory-heavy. max_execution_time/max_input_time raised for large
# imports on slower storage.
RUN { \
        echo 'upload_max_filesize = 512M'; \
        echo 'post_max_size = 512M'; \
        echo 'memory_limit = 512M'; \
        echo 'max_execution_time = 300'; \
        echo 'max_input_time = 300'; \
    } > /usr/local/etc/php/conf.d/webtrees-uploads.ini

WORKDIR /var/www/html

EXPOSE 8000

CMD ["php", "-S", "0.0.0.0:8000"]
