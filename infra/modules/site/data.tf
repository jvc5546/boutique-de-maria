# One DynamoDB table for the whole site ("single-table design"). Every record
# type shares it, told apart by its keys:
#
#   pk = USER#<email>   sk = PROFILE   -> an admin or distributor (type = user)
#   pk = PRODUCT        sk = <id>      -> a product or package    (type = product)
#   pk = SETTINGS       sk = GLOBAL    -> site settings (orders WhatsApp number)
#
# The by-type index lists every record of one type (all users, for the admin page). On-demand billing:
# no capacity to manage, and at this scale it costs cents a month at most.

resource "aws_dynamodb_table" "main" {
  name         = "bdm-main"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  attribute {
    name = "type"
    type = "S"
  }

  global_secondary_index {
    name            = "by-type"
    projection_type = "ALL"

    key_schema {
      attribute_name = "type"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "pk"
      key_type       = "RANGE"
    }
  }

  # Restore to any second in the last 35 days. Billed per GB; this table is
  # a few KB, so effectively free.
  point_in_time_recovery {
    enabled = true
  }

  deletion_protection_enabled = true
}

# The two admin accounts. Distributors are added from the admin page (M4);
# admins live here so the site can never lock everyone out.
resource "aws_dynamodb_table_item" "admin" {
  for_each = var.admins

  table_name = aws_dynamodb_table.main.name
  hash_key   = aws_dynamodb_table.main.hash_key
  range_key  = aws_dynamodb_table.main.range_key

  item = jsonencode({
    pk     = { S = "USER#${each.key}" }
    sk     = { S = "PROFILE" }
    type   = { S = "user" }
    email  = { S = each.key }
    name   = { S = each.value }
    role   = { S = "admin" }
    tier   = { S = "preferred" }
    status = { S = "active" }
  })
}
