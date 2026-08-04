<?php

namespace App\Support;

use App\Models\Workplace;
use GdImage;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

/**
 * Stores a workplace's photo and derives a thumbnail from it.
 *
 * The work is done with GD rather than with an image library from Composer: the
 * hosting ships GD, and `vendor/` travels by FTP — every additional dependency is
 * ballast there. For "scale down, store small" GD is enough.
 *
 * Both images are stored as JPEG regardless of the input format. A transparent
 * PNG gets a white background rather than a black one in the process.
 */
final class WorkplacePhotos
{
    /** Edge length the original is scaled down to. */
    private const MAX_EDGE = 1600;

    private const THUMBNAIL_EDGE = 400;

    private const QUALITY = 82;

    public function store(Workplace $workplace, UploadedFile $file): void
    {
        $image = $this->read($file);
        $image = $this->orient($image, $file->getRealPath());

        $disk = Storage::disk('public');
        $directory = "workplaces/{$workplace->getKey()}";

        $this->remove($workplace);

        // A timestamp in the name so that after a replacement the browser does
        // not show the old image from cache — the URL would otherwise be the same.
        $stamp = now()->format('YmdHis');

        $photo = "{$directory}/foto-{$stamp}.jpg";
        $thumbnail = "{$directory}/vorschau-{$stamp}.jpg";

        // Both sizes are produced from the original, not the small one from the
        // large one — scaling twice costs sharpness.
        foreach ([[$photo, self::MAX_EDGE], [$thumbnail, self::THUMBNAIL_EDGE]] as [$path, $edge]) {
            $scaled = $this->fit($image, $edge);
            $disk->put($path, $this->encode($scaled));

            if ($scaled !== $image) {
                imagedestroy($scaled);
            }
        }

        imagedestroy($image);

        $workplace->update([
            'photo_path' => $photo,
            'photo_thumbnail_path' => $thumbnail,
        ]);
    }

    /** Deletes the files and clears the columns. With no photo, nothing happens. */
    public function remove(Workplace $workplace): void
    {
        $disk = Storage::disk('public');

        foreach ([$workplace->photo_path, $workplace->photo_thumbnail_path] as $path) {
            if ($path !== null) {
                $disk->delete($path);
            }
        }

        $workplace->update(['photo_path' => null, 'photo_thumbnail_path' => null]);
    }

    private function read(UploadedFile $file): GdImage
    {
        $contents = file_get_contents($file->getRealPath());
        $image = $contents === false ? false : imagecreatefromstring($contents);

        if ($image === false) {
            throw new RuntimeException('The image could not be read.');
        }

        return $image;
    }

    /**
     * Rotates the image the way the camera meant it. Without this, photos from a
     * phone lie sideways — for JPEG the orientation lives only in the EXIF data,
     * and that does not survive the redraw.
     */
    private function orient(GdImage $image, string $path): GdImage
    {
        if (! function_exists('exif_read_data')) {
            return $image;
        }

        $exif = @exif_read_data($path);
        $angle = match ($exif['Orientation'] ?? 1) {
            3 => 180,
            6 => -90,
            8 => 90,
            default => 0,
        };

        if ($angle === 0) {
            return $image;
        }

        $rotated = imagerotate($image, $angle, 0);

        if ($rotated === false) {
            return $image;
        }

        imagedestroy($image);

        return $rotated;
    }

    /** Scales down to the longer edge; smaller images stay as they are. */
    private function fit(GdImage $image, int $edge): GdImage
    {
        $width = imagesx($image);
        $height = imagesy($image);
        $longer = max($width, $height);

        if ($longer <= $edge) {
            return $image;
        }

        $scaled = imagescale($image, (int) round($width * $edge / $longer));

        if ($scaled === false) {
            throw new RuntimeException('The image could not be scaled.');
        }

        return $scaled;
    }

    private function encode(GdImage $image): string
    {
        // Lay transparency onto white: JPEG has no alpha channel, and without
        // this intermediate step it would turn black.
        $flat = imagecreatetruecolor(imagesx($image), imagesy($image));
        imagefill($flat, 0, 0, imagecolorallocate($flat, 255, 255, 255));
        imagecopy($flat, $image, 0, 0, 0, 0, imagesx($image), imagesy($image));

        ob_start();
        imagejpeg($flat, null, self::QUALITY);
        $encoded = (string) ob_get_clean();

        imagedestroy($flat);

        return $encoded;
    }
}
