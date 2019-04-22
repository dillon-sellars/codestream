"use strict";
import { RequestType } from "vscode-languageserver-protocol";

export interface ThirdPartyProviderConfig {
	id: string;
	name: string;
	host: string;
	apiHost?: string;
	isEnterprise?: boolean;
	hasIssues?: boolean;
	enterpriseOnly?: boolean;
}

export interface ThirdPartyProviders {
	[providerId: string]: ThirdPartyProviderConfig;
}

export interface ConnectThirdPartyProviderRequest {
	providerId: string;
}

export interface ConnectThirdPartyProviderResponse {}

export const ConnectThirdPartyProviderRequestType = new RequestType<
	ConnectThirdPartyProviderRequest,
	ConnectThirdPartyProviderResponse,
	void,
	void
>("codestream/provider/connect");

export interface DisconnectThirdPartyProviderRequest {
	providerId: string;
}

export interface DisconnectThirdPartyProviderResponse {}

export const DisconnectThirdPartyProviderRequestType = new RequestType<
	DisconnectThirdPartyProviderRequest,
	DisconnectThirdPartyProviderResponse,
	void,
	void
>("codestream/provider/disconnect");

export interface ThirdPartyProviderBoard {
	id: string;
	name: string;
	apiIdentifier?: string;
	assigneesRequired?: boolean;
	assigneesDisabled?: boolean;
	singleAssignee?: boolean;
	[key: string]: any;
}

export interface FetchThirdPartyBoardsRequest {
	providerId: string;
	[key: string]: any;
}

export interface FetchThirdPartyBoardsResponse {
	boards: ThirdPartyProviderBoard[];
}

export const FetchThirdPartyBoardsRequestType = new RequestType<
	FetchThirdPartyBoardsRequest,
	FetchThirdPartyBoardsResponse,
	void,
	void
>("codestream/provider/boards");

export interface ThirdPartyProviderUser {
	id: string;
	displayName: string;
	email?: string;
}

export interface FetchAssignableUsersRequest {
	providerId: string;
	boardId: string;
}

export interface FetchAssignableUsersResponse {
	users: ThirdPartyProviderUser[];
}

export const FetchAssignableUsersRequestType = new RequestType<
	FetchAssignableUsersRequest,
	FetchAssignableUsersResponse,
	void,
	void
>("codestream/provider/cards/users");

export interface CreateThirdPartyCardRequest {
	providerId: string;
	data: {
		[key: string]: any;
	};
}

export interface CreateThirdPartyCardResponse {
	[key: string]: any;
}

export const CreateThirdPartyCardRequestType = new RequestType<
	CreateThirdPartyCardRequest,
	CreateThirdPartyCardResponse,
	void,
	void
>("codestream/provider/cards/create");
