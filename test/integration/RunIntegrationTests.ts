import { setupTestEnvironment } from './utils/setup';
import { ApopotosizeInternalApiTest } from './functions/ApoptosizeInternalApiTest';
import { GetAccountDataInternalApiTest } from './functions/GetAccountDataInternalApiTest';
import { NetworkClass } from '../../src/network';
let myNetworkContext: NetworkClass;
const results: any[] = [];
export const addResult = (testType: string, name: string, result: string, time: number): void => {
    results.push({ testType, name, result, time });
};
const displayResults = (): void => {
    if (results.length === 0) {
    }
    else {
        console.table(results.map((result) => ({
            'Test Type': result.testType,
            Name: result.name,
            Result: result.result,
            Time: `${result.time}ms`,
        })));
        const passedTests = results.filter((result) => result.result === 'Pass').length;
        const failedTests = results.filter((result) => result.result === 'Fail').length;
        const errorTests = results.filter((result) => result.result === 'Error').length;
    }
};
async function runIntegrationTests(): Promise<void> {
    try {
        const { dummyNode, targetNode, networkContext } = await setupTestEnvironment();
        myNetworkContext = networkContext;
        await ApopotosizeInternalApiTest(dummyNode, targetNode);
        await GetAccountDataInternalApiTest(dummyNode, targetNode);
    }
    catch (error) {
        console.error('Error during integration tests:', error);
    }
    finally {
        displayResults();
        await myNetworkContext.shutdown();
        process.exit(0);
    }
}
runIntegrationTests();