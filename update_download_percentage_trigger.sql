DELIMITER //

CREATE TRIGGER update_artist_download_percentage
AFTER UPDATE ON tracks
FOR EACH ROW
BEGIN
    -- Only proceed if download_status has changed
    IF OLD.download_status != NEW.download_status THEN
        -- Update percentage for all artists associated with this track
        UPDATE artists a
        SET download_percentage = (
            SELECT (COUNT(CASE WHEN t.download_status = 'available' THEN 1 END) * 100.0 / COUNT(*))
            FROM tracks t
            JOIN artist_tracks at ON t.id = at.track_id
            WHERE at.artist_id = a.id
        )
        WHERE a.id IN (
            SELECT artist_id 
            FROM artist_tracks 
            WHERE track_id = NEW.id
        );
    END IF;
END//

DELIMITER ;
