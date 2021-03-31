import React, { useState } from "react";
import { useDispatch } from "react-redux";
import Icon from "../../Icon";
import { Button } from "@codestream/webview/src/components/Button";
import { OutlineBox, FlexRow } from "./PullRequest";
import { api } from "../../../store/providerPullRequests/actions";
import { PRHeadshotName } from "@codestream/webview/src/components/HeadshotName";
import Tooltip from "../../Tooltip";
import { Link } from "../../Link";
import { GitLabMergeRequest } from "@codestream/protocols/agent";

export const ApproveBox = (props: { pr: GitLabMergeRequest }) => {
	const dispatch = useDispatch();

	if (!props.pr.userPermissions?.canApprove) return null;

	const [isLoading, setIsLoading] = useState(false);
	const onApproveClick = async (e: React.MouseEvent<Element, MouseEvent>, approve: boolean) => {
		setIsLoading(true);
		try {
			await dispatch(
				api("togglePullRequestApproval", {
					approve: approve
				})
			);
		} catch (ex) {
			console.error(ex);
		} finally {
			setIsLoading(false);
		}
	};

	const approvers = props.pr.approvedBy ? props.pr.approvedBy.nodes : [];
	const iHaveApproved = approvers.find(_ => _.login === props.pr.viewer.login);
	const isApproved = approvers.length > 0;
	const render = () => {
		if (isApproved) {
			return (
				<>
					<b>Merge request approved. </b>
					Approved by{" "}
					{approvers.map(_ => (
						<PRHeadshotName person={_} />
					))}
				</>
			);
		}

		if (props.pr.supports.approvalsRequired) {
			if (!props.pr.approvalsRequired) {
				return (
					<>
						Approval is optional
						{!props.pr.mergedAt && (
							<>
								{" "}
								<Link
									href={`${props.pr.baseWebUrl}/help/user/project/merge_requests/merge_request_approvals`}
								>
									<Icon name="info" title="About this feature" placement="top" />
								</Link>
							</>
						)}
					</>
				);
			} else {
				return <>Requires approval</>;
			}
		}
		return null;
	};

	return (
		<OutlineBox>
			<FlexRow>
				<div className="row-icon" style={{ position: "relative" }}>
					<Icon name="person" className="bigger" />
					<Icon name="check" className="overlap" />
				</div>
				{!props.pr.merged && (
					<>
						{iHaveApproved ? (
							<Tooltip title="Revoke approval" placement="top">
								<Button
									className="action-button"
									variant="warning"
									onClick={e => onApproveClick(e, !iHaveApproved)}
								>
									Revoke
								</Button>
							</Tooltip>
						) : (
							<Button
								isLoading={isLoading}
								className="action-button"
								onClick={e => onApproveClick(e, !iHaveApproved)}
							>
								Approve
							</Button>
						)}
					</>
				)}

				<div className="pad-left">{render()}</div>
			</FlexRow>
		</OutlineBox>
	);
};
