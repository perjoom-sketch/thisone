# AliExpress Integration Suspended

## Summary

AliExpress API integration has been tested and is suspended for now. The probe results indicate an AliExpress portal/account/API permission/business license/app-key state issue rather than a ThisOne UI, search, ranking, or recommendation logic issue.

## Probe history

The AliExpress API integration was tested through the following diagnostic probes:

- `sigprobe`
- `topprobe`
- `docprobe`
- `finalprobe`
- `restprobe`
- `syncprobe`

No probe returned usable product data.

## Observed failures

- Method-prefix signatures returned `IncompleteSignature`.
- The `eco.taobao` endpoint returned `Invalid app Key`.
- The `api-sg` `/sync` endpoint accepted requests but returned `404 System Error` inside `aliexpress_affiliate_product_query_response`.
- The REST direct path reached timestamp validation but failed with `InvalidApiPath`.

## Conclusion

The failures are most likely caused by AliExpress portal/account/API permission/business license/app-key state rather than ThisOne production UI/search logic.

## Decision

- Suspend AliExpress integration for now.
- Do not remove existing diagnostic code yet.
- Do not route production search through AliExpress.
- Do not change production behavior, UI, search ranking, or recommendation logic for this suspension.
- Revisit only if AliExpress provides a working official CURL sample for this exact app key.
