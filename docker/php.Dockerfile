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
        unzip \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" \
        gd \
        intl \
        pdo_sqlite \
        zip \
        mbstring \
        curl \
    # data/config.ini.php in this repo uses dbtype="sqlite" (pdo_sqlite,
    # above). Add pdo_mysql/pdo_pgsql here too if you switch dbtype.
    && rm -rf /var/lib/apt/lists/*

WORKDIR /var/www/html

EXPOSE 8000

CMD ["php", "-S", "0.0.0.0:8000"]
