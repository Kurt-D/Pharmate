# PharMate Google ML Kit OCR validation protocol

## Status

The production OCR path uses the bundled Google ML Kit Text Recognition v2 Latin-script model in the Capacitor Android/iOS container. Tesseract.js is not used. Browser sessions cannot run ML Kit and must show manual entry instead.

The application records no label image. After a person checks the result against the physical package, it records field-level detected and confirmed values, image-quality category, device information, processing time, offline state, and calculated accuracy. Aggregate results appear under **Admin → OCR Validation**.

An accuracy percentage must not be reported until this protocol has been run with real Philippine medicine packaging. Automated parser tests are regression tests, not measured packaging accuracy.

## Dataset

Use legally obtained, currently marketed Philippine medicine packaging. Include at least:

- cartons, bottles, blister packs, sachets, tubes, and dispensing labels;
- generic and branded products;
- tablets, capsules, syrups, oral suspensions, drops, creams, ointments, inhalers, ampoules, and vials;
- strengths written as mg, mcg, g, mg/mL, mg/5 mL, IU, units, and percentages;
- English, Filipino, and mixed-language label text using the Latin script.

Create a dataset register outside PharMate containing a non-patient sample code, product name, strength, formulation, package type, lighting condition, and the licensed pharmacist who confirmed the ground truth. Do not use patient prescriptions in the packaging benchmark.

## Capture matrix

For every product, capture:

1. Clear, centered label in normal indoor light.
2. Mild motion blur.
3. Low light or shadow.
4. Cropped or partially obscured label.
5. Angled or curved packaging.
6. Glare on blister foil or glossy cartons.

Repeat representative captures on every supported Android model. Run at least one full pass in airplane mode after the app has been installed. Reopen the app while still offline to confirm the bundled model does not depend on a first-use download.

## Ground truth and metrics

After each usable scan, compare the suggested medicine name, strength, and formulation with the physical package and correct every difference before confirmation.

The dashboard reports normalized edit accuracy for each field and their mean:

`accuracy = 100 × (1 − edit distance / longer normalized field length)`

Also report:

- total and distinct packages;
- recapture rate for blurry, incomplete, low-light, and too-small images;
- manual-review and manual-correction rates;
- accuracy by image-quality category;
- accuracy and average processing time by device;
- number of runs completed offline.

## Release decision

Before a pilot, a licensed pharmacist must review the package register, ground truth, failed scans, and aggregate dashboard. Record the accepted thresholds and reviewer decision in the study documentation. PharMate's default field-completeness confidence threshold is 75%; this is a workflow threshold, not a probability that the medicine is clinically correct.
