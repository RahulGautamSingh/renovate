Reproduction fixture for issue `#42076`

This directory is a self-contained Ant example for exercising the new `ant` manager locally.

It includes:

- inline `version=` dependencies
- same-file `<property name="..." value="..."/>`
- external `.properties` files loaded via `<property file="..."/>`
- imported XML files via `<import file="..."/>`
- `coords=` dependencies
- Maven `settings.xml` discovery via `settingsFile="..."`
- first-definition-wins property precedence

Important precedence example:

- `versions/versions-a.properties` defines `junit.version=4.13.2`
- `versions/versions-b.properties` defines `junit.version=4.13.3`
- Because Ant properties are immutable, the first file wins

