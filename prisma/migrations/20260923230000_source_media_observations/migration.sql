CREATE TABLE "source_media_observations" (
    "id" UUID NOT NULL,
    "source_record_id" UUID NOT NULL,
    "source_url" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "observed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "page_content_hash" TEXT,
    CONSTRAINT "source_media_observations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "source_media_observations_source_record_id_source_url_kind_key"
    ON "source_media_observations"("source_record_id", "source_url", "kind");

CREATE INDEX "source_media_observations_source_url_idx"
    ON "source_media_observations"("source_url");

ALTER TABLE "source_media_observations"
    ADD CONSTRAINT "source_media_observations_source_record_id_fkey"
    FOREIGN KEY ("source_record_id") REFERENCES "source_records"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
