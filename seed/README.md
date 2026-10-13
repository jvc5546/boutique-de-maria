# Sample data

`catalog-sample.json`: nine sample products in three scents (prices in cents, MXN), in
DynamoDB's own JSON format, ready for `batch-write-item` (max 25 items per call).

```bash
export AWS_PROFILE=boutique-staging   # or boutique for production
aws dynamodb batch-write-item --request-items file://seed/catalog-sample.json
```

Expected output: `{"UnprocessedItems": {}}` (empty = all written). Running it again just
overwrites the same nine products.
