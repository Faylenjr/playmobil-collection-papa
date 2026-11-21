DO $$
BEGIN
    PERFORM set_config('lock_timeout', '5s', true);

    CREATE TABLE "personal_photos" (
        "variant_id" UUID PRIMARY KEY REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "data" BYTEA NOT NULL CHECK (octet_length("data") BETWEEN 1 AND 1572864),
        "revision" CHAR(64) NOT NULL,
        "updated_at" TIMESTAMP(3) NOT NULL
    );

    INSERT INTO "sources" ("id", "key", "name", "base_url", "kind", "enabled")
    VALUES ('4afe3b63-e9ae-4d97-b129-ac99c12437b1', 'collector-personal', 'Photo personnelle', '/collection-photos', 'OTHER', true)
    ON CONFLICT ("key") DO NOTHING;
END $$;
