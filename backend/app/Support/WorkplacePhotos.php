<?php

namespace App\Support;

use App\Models\Workplace;
use GdImage;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

/**
 * Legt das Foto eines Arbeitsplatzes ab und leitet ein Vorschaubild davon ab.
 *
 * Gerechnet wird mit GD und nicht mit einer Bildbibliothek aus Composer: das
 * Hosting bringt GD mit, und `vendor/` wird per FTP mitgeliefert — jede
 * zusätzliche Abhängigkeit ist dort Ballast. Für "gross skalieren, klein
 * speichern" reicht GD.
 *
 * Beide Bilder werden als JPEG abgelegt, unabhängig vom Eingangsformat. Ein
 * durchsichtiges PNG bekommt dabei weissen Grund statt schwarzem.
 */
final class WorkplacePhotos
{
    /** Kantenlänge, auf die das Original heruntergerechnet wird. */
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

        // Ein Zeitstempel im Namen, damit der Browser nach dem Ersetzen nicht
        // das alte Bild aus dem Cache zeigt — die URL ist sonst dieselbe.
        $stamp = now()->format('YmdHis');

        $photo = "{$directory}/foto-{$stamp}.jpg";
        $thumbnail = "{$directory}/vorschau-{$stamp}.jpg";

        // Beide Grössen entstehen aus dem Original, nicht die kleine aus der
        // grossen — zweimal skalieren kostet Schärfe.
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

    /** Löscht die Dateien und leert die Spalten. Ohne Foto passiert nichts. */
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
            throw new RuntimeException('Das Bild liess sich nicht lesen.');
        }

        return $image;
    }

    /**
     * Dreht das Bild so, wie die Kamera es gemeint hat. Ohne das liegen Fotos
     * vom Telefon quer — die Ausrichtung steckt bei JPEG nur in den
     * EXIF-Daten, und die überleben das Neuzeichnen nicht.
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

    /** Verkleinert auf die längere Kante; kleinere Bilder bleiben, wie sie sind. */
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
            throw new RuntimeException('Das Bild liess sich nicht skalieren.');
        }

        return $scaled;
    }

    private function encode(GdImage $image): string
    {
        // Durchsichtigkeit auf Weiss legen: JPEG kennt keinen Alphakanal, und
        // ohne diesen Zwischenschritt würde daraus Schwarz.
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
