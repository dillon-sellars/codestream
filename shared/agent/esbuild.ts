import * as path from "path";
import * as os from "os";
import * as fs from "fs-extra";
import * as crypto from "crypto";

import graphqlLoaderPlugin from "@luckycatfactory/esbuild-graphql-loader";
import { BuildOptions } from "esbuild";

import { copyPlugin, CopyStuff } from "../build/src/copyPlugin";
import { Args, commonEsbuildOptions, processArgs, startEsbuild } from "../build/src/esbuildCommon";
import { nativeNodeModulesPlugin } from "../build/src/nativeNodeModulesPlugin";
import { statsPlugin } from "../build/src/statsPlugin";
import { promisify } from "util";
import { readFileSync, rmSync } from "fs";

let packageLockSha: string | undefined;

const exec = promisify(require("child_process").exec);

const outputDir = path.resolve(__dirname, "dist");

let prodDepsDir: string | undefined;

function getDepsRoot(watchMode: boolean): string {
	if (watchMode) {
		return path.resolve(__dirname);
	}
	if (!prodDepsDir) {
		throw new Error("Could not resolve prod deps directory");
	}
	return prodDepsDir;
}

function calculatePackageLockSha(): string {
	const packageLock = readFileSync(path.join(__dirname, "package-lock.json"));
	const hash = crypto.createHash("sha1");
	hash.update(packageLock);
	return hash.digest("hex");
}

function getPostBuildCopy(args: Args): CopyStuff[] {
	const currentPackageLockSha = calculatePackageLockSha();
	let result: CopyStuff[];
	const nodeModulesDest = path.join(outputDir, "node_modules");
	if (packageLockSha !== currentPackageLockSha) {
		console.log(
			`package-lock.json has changed. Removing ${nodeModulesDest} and copying new dependencies`
		);
		if (args.watchMode) {
			console.log(`Removing ${nodeModulesDest}`);
			rmSync(nodeModulesDest, { recursive: true });
		}
		result = [
			{
				from: "node_modules/opn/**/xdg-open",
				to: outputDir,
			},
			{
				from: path.join(getDepsRoot(args.watchMode), "node_modules/**"),
				to: nodeModulesDest,
				options: { ignore: ["**/@newrelic/security-agent/**"] }, // Path too long for windows
			},
		];
	} else {
		result = [
			{
				from: "node_modules/opn/**/xdg-open",
				to: outputDir,
			},
		];
	}
	packageLockSha = currentPackageLockSha;
	return result;
}

// No need to package up the dev dependencies - copy minimal files so that `npm i --production works` and copy the
// smaller node_modules
async function installProdDeps(tmpDir: string) {
	await fs.copyFile("package.json", path.join(tmpDir, "package.json"));
	await fs.copyFile("package-lock.json", path.join(tmpDir, "package-lock.json"));
	await fs.copyFile("prepare.js", path.join(tmpDir, "prepare.js"));
	const patchDir = path.join(__dirname, "patches");
	await fs.copy(patchDir, path.join(tmpDir, "patches"));

	const currentDir = process.cwd();
	process.chdir(tmpDir);
	const { error, stdout, stderr } = await exec("npm i --omit=dev");
	if (stderr || error) {
		console.error(`stdout: ${stdout}\nstderr: ${stderr}\n ${error?.message}`);
		if (error) {
			throw new Error("Unable to npm i --production");
		}
	}
	// Remove this bizarre extra file that shows up only on linux only for --omit=dev that breaks vcse package
	if (os.platform() === "linux") {
		const evilVile = path.join(
			tmpDir,
			"node_modules/pubnub/lib/crypto/modules/NodeCryptoModule/NodeCryptoModule.js"
		);
		const nonEvil = path.join(
			tmpDir,
			"node_modules/pubnub/lib/crypto/modules/NodeCryptoModule/nodeCryptoModule.js"
		);

		if ((await fs.pathExists(evilVile)) && (await fs.pathExists(nonEvil))) {
			console.log(`Removing evil file ${evilVile}`);
			await fs.unlink(evilVile);
		}
	}

	console.log(stdout);
	process.chdir(currentDir);
}

(async function () {
	try {
		const args = processArgs();
		if (!args.watchMode) {
			prodDepsDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-esbuild"));
			if (!prodDepsDir) {
				throw new Error("Could not create temp dir");
			}
			console.log(`Created temp dir ${prodDepsDir}`);
			await installProdDeps(prodDepsDir);
		}
		const buildOptions: BuildOptions = {
			...commonEsbuildOptions(false, args),
			entryPoints: {
				agent: "./src/main.ts",
				"agent-vs-2019": "./src/main-vs-2019.ts",
			},
			// The newrelic agent doesn't support bundling.
			packages: "external",
			plugins: [
				graphqlLoaderPlugin(),
				nativeNodeModulesPlugin,
				statsPlugin,
				copyPlugin({ onEnd: () => getPostBuildCopy(args) }),
			],
			format: "cjs",
			platform: "node",
			target: "node18.15",
			outdir: outputDir,
			sourceRoot: args.ide === "vs" ? path.resolve(__dirname, "../agent/dist") : undefined,
			sourcesContent: args.mode === "development" && args.ide !== "vs",
		};

		await startEsbuild(args, buildOptions);
	} finally {
		try {
			if (prodDepsDir) {
				await fs.rm(prodDepsDir, { recursive: true });
			}
		} catch (e) {
			console.error(
				`An error has occurred while removing the temp folder at ${prodDepsDir}. Please remove it manually. Error: ${e}`
			);
		}
	}
})();
