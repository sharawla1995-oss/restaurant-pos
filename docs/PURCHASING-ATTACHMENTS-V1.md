# Purchasing Attachments / Supplier Invoice Archive V1

Status: Beta foundation
Target: isolated SH-0007 backend first
Production SH-0005 / SH-0006 / Top Burger: unchanged

## Purpose

Allow a business to attach invoice evidence to purchasing records and review it later by supplier, document date, invoice/reference number, and branch.

## Supported files

- JPEG
- PNG
- WEBP
- HEIC / HEIF
- PDF
- Maximum 15 MB per file
- Up to 8 files per upload action in the current UI

## User flow

1. Open Purchasing or the Supplier Invoice Archive.
2. Choose supplier.
3. Optionally link an existing supplier invoice.
4. Choose document type and document date.
5. Enter invoice/reference number and optional note.
6. Select one or more images/PDFs.
7. Sharawla creates a pending metadata record.
8. The private Storage object is uploaded.
9. Backend verifies the object exists and finalizes the metadata row.
10. The document becomes visible in the archive.

Old invoices can receive attachments later. A document does not have to be uploaded at the moment the purchase is created.

## Archive filters

- Supplier
- From date
- To date
- Search by invoice/reference number
- Search by supplier name
- Search by original file name

## Permissions

- `purchasing.attachments.view`
- `purchasing.attachments.upload`
- `purchasing.attachments.delete`

Visibility is not only UI-based. Storage and RPC access also enforce action permission and branch access.

## Security

- Storage bucket: `purchase-documents`
- Bucket is private.
- Object path starts with branch id.
- Storage SELECT requires attachment-view permission + branch access.
- Storage INSERT requires attachment-upload permission + branch access.
- Metadata table uses RLS.
- Delete in normal UI is soft delete; object remains private for audit/history.
- Prepare/finalize/delete operations are audit logged.

## Connectivity behavior

The current V1 upload requires internet. If the device is offline, purchasing can continue and the user can return later to the old invoice and upload its image/document when online. The archive itself is designed around durable server storage; a future phase may add a local encrypted pending-file outbox if offline binary capture is required.
