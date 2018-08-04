import { createStore } from "codestream-components";
// import Raven from "raven-js";
// import createRavenMiddleware from "raven-for-redux";
// import pubnubMiddleWare from "./pubnub-middleware";
// import umiMiddleWare from "./umi-middleware";
// import contextualCommands from "./contextual-commands-middleware";
// import analyticsMiddleware from "./analytics-middleware";
// import presenceMiddleWare from "./presence-middleware";

export default (initialState = {}, api) => {
	return createStore(initialState, { api }, [
		// pubnubMiddleWare,
		// umiMiddleWare,
		// contextualCommands,
		// analyticsMiddleware,
		// presenceMiddleWare,
		// createRavenMiddleware(Raven, {
		// 	stateTransformer: ({ context, session, repoAttributes, messaging, onboarding }) => {
		// 		return {
		// 			context,
		// 			messaging,
		// 			onboarding,
		// 			repoAttributes,
		// 			session: { ...session, accessToken: Boolean(session.accessToken) }
		// 		};
		// 	},
		// 	getUserContext: ({ session, users }) => {
		// 		if (session.userId) {
		// 			const user = users[session.userId];
		// 			try {
		// 				if (user && user.preferences.telemetryConsent) return user;
		// 			} catch (e) {
		// 				return undefined;
		// 			}
		// 		}
		// 	}
		// })
	]);
};
