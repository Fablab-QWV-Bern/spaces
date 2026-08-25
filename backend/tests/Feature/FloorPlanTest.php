<?php

use App\Models\Role;
use App\Support\FloorPlan;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Spectator\Spectator;

beforeEach(function () {
    Spectator::using('reservation-api.yml');
    $this->seed(DatabaseSeeder::class);

    $this->admin = Role::where('name', 'Admin')->firstOrFail();
    $this->member = Role::where('name', 'Mitglied')->firstOrFail();

    Storage::fake('public');
});

/** A plan of the smallest kind the map would accept: a layer with one bench. */
function plan(string $inside = '<path id="holz-1" style="fill:rgb(255,219,73)"/>'): string
{
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">'
        .'<g id="Arbeitsplätze">'.$inside.'</g>'
        .'</svg>';
}

function upload(string $svg, string $name = 'karte.svg'): UploadedFile
{
    return UploadedFile::fake()->createWithContent($name, $svg);
}

it('reports the shipped plan while nothing is uploaded', function (): void {
    $this->getJson('/api/floor-plan')
        ->assertValidRequest()
        ->assertValidResponse(200)
        ->assertJson(['url' => '/karte.svg', 'isDefault' => true, 'updatedAt' => null]);
});

// Only the response is checked against the spec: Spectator compares the
// request's media type literally and trips over the "; boundary=…" that every
// multipart request carries.
it('stores an uploaded plan and reports it afterwards', function (): void {
    $response = $this->actingAs($this->admin)
        ->post('/api/floor-plan', ['file' => upload(plan())], ['Accept' => 'application/json'])
        ->assertValidResponse(200);

    expect($response->json('isDefault'))->toBeFalse()
        ->and($response->json('url'))->toStartWith('/storage/')
        ->and($response->json('updatedAt'))->not->toBeNull();

    Storage::disk('public')->assertExists(FloorPlan::PATH);

    // The drawing survives — ids and layers are the contract with the map.
    expect(Storage::disk('public')->get(FloorPlan::PATH))
        ->toContain('id="holz-1"')
        ->toContain('Arbeitsplätze');
});

it('falls back to the shipped plan when the uploaded one is dropped', function (): void {
    $this->actingAs($this->admin)
        ->post('/api/floor-plan', ['file' => upload(plan())], ['Accept' => 'application/json'])
        ->assertValidResponse(200);

    $this->actingAs($this->admin)
        ->deleteJson('/api/floor-plan')
        ->assertValidRequest()
        ->assertValidResponse(200)
        ->assertJson(['url' => '/karte.svg', 'isDefault' => true]);

    Storage::disk('public')->assertMissing(FloorPlan::PATH);
});

it('keeps the plan out of reach without manageWorkplaces', function (): void {
    $this->actingAs($this->member)
        ->post('/api/floor-plan', ['file' => upload(plan())], ['Accept' => 'application/json'])
        ->assertValidResponse(403);

    $this->deleteJson('/api/floor-plan')->assertValidResponse(403);

    Storage::disk('public')->assertMissing(FloorPlan::PATH);
});

it('refuses what is not an SVG', function (): void {
    $this->actingAs($this->admin)
        ->post(
            '/api/floor-plan',
            ['file' => upload('das ist kein plan', 'karte.txt')],
            ['Accept' => 'application/json'],
        )
        ->assertValidResponse(422);

    Storage::disk('public')->assertMissing(FloorPlan::PATH);
});

it('refuses a plan that defines its own entities', function (): void {
    $svg = '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "aaaa">]>'
        .'<svg xmlns="http://www.w3.org/2000/svg"><g id="Arbeitsplätze">&a;</g></svg>';

    $this->actingAs($this->admin)
        ->post('/api/floor-plan', ['file' => upload($svg)], ['Accept' => 'application/json'])
        ->assertValidResponse(422);

    Storage::disk('public')->assertMissing(FloorPlan::PATH);
});

// What every drawing tool writes at the top of an SVG. Refusing it would refuse
// the workshop's own plan.
it('accepts the ordinary SVG doctype and drops it', function (): void {
    $svg = '<?xml version="1.0" encoding="UTF-8"?>'
        .'<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" '
        .'"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">'
        .plan();

    $this->actingAs($this->admin)
        ->post('/api/floor-plan', ['file' => upload($svg)], ['Accept' => 'application/json'])
        ->assertValidResponse(200);

    expect(Storage::disk('public')->get(FloorPlan::PATH))
        ->not->toContain('DOCTYPE')
        ->toContain('id="holz-1"');
});

// The interface parses the plan and grafts it into its own document, so
// everything in the file would run in the application's origin.
it('strips what could act or fetch', function (): void {
    $svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">'
        .'<script>fetch("//anderswo")</script>'
        .'<style>@import url(//anderswo/x.css);</style>'
        .'<g id="Arbeitsplätze">'
        .'<path id="holz-1" onclick="alert(1)" style="fill:rgb(255,219,73)"/>'
        .'<a href="javascript:alert(2)"><path id="holz-2"/></a>'
        .'<image xlink:href="https://anderswo/logo.png"/>'
        .'<use xlink:href="#figur"/>'
        .'<foreignObject><div>hallo</div></foreignObject>'
        .'</g></svg>';

    $this->actingAs($this->admin)
        ->post('/api/floor-plan', ['file' => upload($svg)], ['Accept' => 'application/json'])
        ->assertValidResponse(200);

    $stored = Storage::disk('public')->get(FloorPlan::PATH);

    expect($stored)
        ->not->toContain('<script')
        ->not->toContain('@import')
        ->not->toContain('onclick')
        ->not->toContain('javascript:')
        ->not->toContain('anderswo')
        ->not->toContain('foreignObject')
        // What is drawn stays drawn, references inside the document included.
        ->toContain('id="holz-1"')
        ->toContain('id="holz-2"')
        ->toContain('#figur');
});
