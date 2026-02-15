-- Add local_images column to artists table
ALTER TABLE artists 
ADD COLUMN IF NOT EXISTS local_images JSON DEFAULT NULL COMMENT 'Locally stored images' AFTER images;

-- Add local_images column to albums table
ALTER TABLE albums 
ADD COLUMN IF NOT EXISTS local_images JSON DEFAULT NULL COMMENT 'Locally stored images' AFTER images;

-- Note: Indexes are not needed for JSON columns used only for serving images
