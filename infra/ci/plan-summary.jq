# What a plan will do, from `tofu show -json`: one "- action `address`" line per
# resource. This output is public (ADR 0024), so it holds addresses and action
# names and never a value from the plan.

def action:
  (.change.actions | sort) as $actions
  | [
      (if .change.importing then "import" else empty end),
      (if .previous_address then "move" else empty end),
      (
        if $actions == ["no-op"] then empty
        elif $actions == ["create", "delete"] then "replace"
        else $actions | join("+")
        end
      )
    ]
  | join("+");

(.resource_changes // [])[]
| action as $action
| select($action != "")
| "- \($action) `\(.address)`"
