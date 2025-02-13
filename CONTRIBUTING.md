# Contributing

This project welcomes contributions and suggestions. Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.opensource.microsoft.com.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

# How to contribute to the Application Insights Node.js SDK

1. Install all dependencies with `npm install`.
2. Set an environment variable to your Connection String (optional).
    ```bash
    // windows
    set APPINSIGHTS_INSTRUAPPLICATIONINSIGHTS_CONNECTION_STRINGMENTATIONKEY=<YOUR_CONNECTION_STRING>
    // linux/macos
    export APPLICATIONINSIGHTS_CONNECTION_STRING=<YOUR_CONNECTION_STRING>
    ```
3. Run tests
    ```bash
    npm run test
    npm run backcompattest
    npm run functionaltest
    ```
    _Note: Functional tests require Docker_

---