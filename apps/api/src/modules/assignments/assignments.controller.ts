import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Patch,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  assignRequestSchema,
  createAssignmentRequestSchema,
  feedbackRequestSchema,
  submissionRequestSchema,
  updateAssignmentRequestSchema,
  type AssignRequest,
  type AssignResult,
  type AttachmentLink,
  type CreateAssignmentRequest,
  type EnrolledStudent,
  type FeedbackRequest,
  type MyAssignment,
  type MyAssignmentDetail,
  type Recipient,
  type StaffAssignment,
  type StaffSubmission,
  type Submission,
  type SubmissionRequest,
  type UpdateAssignmentRequest,
} from "@chartnexa/api-contracts";
import { ApiErrors, ApiZodBody } from "../../platform/openapi-helpers.js";
import { ZodPipe } from "../../platform/zod.pipe.js";
import { RequirePermission } from "../access/index.js";
import {
  Authenticated,
  Ctx,
  CurrentUser,
  type AuthContext,
  type RequestCtx,
} from "../identity/index.js";
import { AssignmentsService } from "./assignments.service.js";

const idPipe = () => new ZodPipe(z.uuid());
const courseOf = (req: FastifyRequest) => ({
  courseId: (req.params as { courseId?: string }).courseId ?? "",
});
const actor = (u: AuthContext, c: RequestCtx) => ({ userId: u.userId, requestId: c.requestId });

@ApiTags("staff")
@Controller("staff/courses/:courseId")
export class StaffAssignmentsController {
  constructor(@Inject(AssignmentsService) private readonly svc: AssignmentsService) {}

  @Get("assignments")
  @RequirePermission("assignments:manage", { resource: courseOf })
  @ApiOperation({
    summary: "A course's assignments with how many are assigned, handed in and reviewed",
  })
  @ApiErrors(404)
  list(@Param("courseId", idPipe()) courseId: string): Promise<{ items: StaffAssignment[] }> {
    return this.svc.list(courseId);
  }

  @Post("assignments")
  @HttpCode(201)
  @RequirePermission("assignments:manage", { resource: courseOf })
  @ApiOperation({ summary: "Create an assignment (draft unless published right away)" })
  @ApiZodBody(createAssignmentRequestSchema)
  @ApiErrors(400, 404)
  create(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Body(new ZodPipe(createAssignmentRequestSchema)) body: CreateAssignmentRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<StaffAssignment> {
    return this.svc.create(actor(user, ctx), courseId, body);
  }

  @Get("enrolled-students")
  @RequirePermission("assignments:manage", { resource: courseOf })
  @ApiOperation({
    summary: "People with active access to the course, for choosing who to assign to",
  })
  @ApiErrors(404)
  enrolled(@Param("courseId", idPipe()) courseId: string): Promise<{ items: EnrolledStudent[] }> {
    return this.svc.enrolled(courseId);
  }

  @Get("assignments/:id")
  @RequirePermission("assignments:manage", { resource: courseOf })
  @ApiOperation({ summary: "One assignment" })
  @ApiErrors(404)
  get(
    @Param("courseId", idPipe()) courseId: string,
    @Param("id", idPipe()) id: string,
  ): Promise<StaffAssignment> {
    return this.svc.get(courseId, id);
  }

  @Patch("assignments/:id")
  @RequirePermission("assignments:manage", { resource: courseOf })
  @ApiOperation({ summary: "Change, publish or withdraw an assignment (needs the version)" })
  @ApiZodBody(updateAssignmentRequestSchema)
  @ApiErrors(400, 404, 409)
  update(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Param("id", idPipe()) id: string,
    @Body(new ZodPipe(updateAssignmentRequestSchema)) body: UpdateAssignmentRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<StaffAssignment> {
    return this.svc.update(actor(user, ctx), courseId, id, body);
  }

  @Put("assignments/:id/attachment")
  @RequirePermission("assignments:manage", { resource: courseOf })
  @ApiOperation({
    summary:
      "Attach one file (PDF, image, Word or text, up to 4 MB) as raw bytes; ?name= sets its name",
  })
  @ApiErrors(400, 404)
  setAttachment(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Param("id", idPipe()) id: string,
    @Query("name") name: string | undefined,
    @Body() body: unknown,
    @Ctx() ctx: RequestCtx,
  ): Promise<StaffAssignment> {
    return this.svc.setAttachment(actor(user, ctx), courseId, id, name, body);
  }

  @Delete("assignments/:id/attachment")
  @RequirePermission("assignments:manage", { resource: courseOf })
  @ApiOperation({ summary: "Remove the attachment (repeating it changes nothing)" })
  @ApiErrors(404)
  removeAttachment(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Param("id", idPipe()) id: string,
    @Ctx() ctx: RequestCtx,
  ): Promise<StaffAssignment> {
    return this.svc.removeAttachment(actor(user, ctx), courseId, id);
  }

  @Post("assignments/:id/attachment-link")
  @HttpCode(200)
  @RequirePermission("assignments:manage", { resource: courseOf })
  @ApiOperation({ summary: "A short-lived link to the attachment" })
  @ApiErrors(404)
  link(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Param("id", idPipe()) id: string,
  ): Promise<AttachmentLink> {
    return this.svc.staffLink(user.userId, courseId, id);
  }

  @Post("assignments/:id/assign")
  @HttpCode(200)
  @RequirePermission("assignments:manage", { resource: courseOf })
  @ApiOperation({ summary: "Assign a published assignment to chosen students or all with access" })
  @ApiZodBody(assignRequestSchema)
  @ApiErrors(400, 404, 409)
  assign(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Param("id", idPipe()) id: string,
    @Body(new ZodPipe(assignRequestSchema)) body: AssignRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<AssignResult> {
    return this.svc.assign(actor(user, ctx), courseId, id, body);
  }

  @Get("assignments/:id/recipients")
  @RequirePermission("assignments:manage", { resource: courseOf })
  @ApiOperation({ summary: "Who has the assignment and where they are with it" })
  @ApiErrors(404)
  recipients(
    @Param("courseId", idPipe()) courseId: string,
    @Param("id", idPipe()) id: string,
  ): Promise<{ items: Recipient[] }> {
    return this.svc.recipients(courseId, id);
  }

  @Get("assignments/:id/submissions/:userId")
  @RequirePermission("assignments:manage", { resource: courseOf })
  @ApiOperation({ summary: "One student's handed-in work" })
  @ApiErrors(404)
  submission(
    @Param("courseId", idPipe()) courseId: string,
    @Param("id", idPipe()) id: string,
    @Param("userId", idPipe()) userId: string,
  ): Promise<StaffSubmission> {
    return this.svc.submissionOf(courseId, id, userId);
  }

  @Put("assignments/:id/submissions/:userId/feedback")
  @RequirePermission("assignments:manage", { resource: courseOf })
  @ApiOperation({ summary: "Give feedback; the work is then reviewed and locked for the student" })
  @ApiZodBody(feedbackRequestSchema)
  @ApiErrors(400, 404)
  feedback(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Param("id", idPipe()) id: string,
    @Param("userId", idPipe()) userId: string,
    @Body(new ZodPipe(feedbackRequestSchema)) body: FeedbackRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<StaffSubmission> {
    return this.svc.giveFeedback(actor(user, ctx), courseId, id, userId, body);
  }
}

@ApiTags("me")
@Controller("me/assignments")
export class MyAssignmentsController {
  constructor(@Inject(AssignmentsService) private readonly svc: AssignmentsService) {}

  @Get()
  @Authenticated()
  @ApiOperation({ summary: "Assignments given to you, work still to do first" })
  @ApiErrors(401)
  list(@CurrentUser() user: AuthContext): Promise<{ items: MyAssignment[] }> {
    return this.svc.listMine(user.userId);
  }

  @Get(":id")
  @Authenticated()
  @ApiOperation({ summary: "One of your assignments with your work and feedback" })
  @ApiErrors(401, 404)
  get(
    @CurrentUser() user: AuthContext,
    @Param("id", idPipe()) id: string,
  ): Promise<MyAssignmentDetail> {
    return this.svc.getMine(user.userId, id);
  }

  @Put(":id/submission")
  @Authenticated()
  @ApiOperation({ summary: "Hand in or change your answer (until it has been reviewed)" })
  @ApiZodBody(submissionRequestSchema)
  @ApiErrors(400, 401, 404, 409)
  submit(
    @CurrentUser() user: AuthContext,
    @Param("id", idPipe()) id: string,
    @Body(new ZodPipe(submissionRequestSchema)) body: SubmissionRequest,
  ): Promise<Submission> {
    return this.svc.submit(user.userId, id, body);
  }

  @Post(":id/attachment-link")
  @HttpCode(200)
  @Authenticated()
  @ApiOperation({ summary: "A short-lived link to the assignment's attachment" })
  @ApiErrors(401, 404)
  link(
    @CurrentUser() user: AuthContext,
    @Param("id", idPipe()) id: string,
  ): Promise<AttachmentLink> {
    return this.svc.studentLink(user.userId, id);
  }
}

@ApiTags("files")
@Controller("assignment-files")
export class AssignmentFilesController {
  constructor(@Inject(AssignmentsService) private readonly svc: AssignmentsService) {}

  @Get(":id")
  @ApiOperation({ summary: "An assignment attachment for a signed link" })
  @ApiErrors(404)
  async read(
    @Param("id", idPipe()) id: string,
    @Query("t") token: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    const file = token ? await this.svc.openAttachment(id, token) : null;
    if (!file) throw new NotFoundException("This link is invalid or has expired.");
    void reply
      .header("content-type", file.mimeType)
      .header("content-length", String(file.size))
      .header(
        "content-disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      )
      .header("cache-control", "private, no-store")
      .header("x-content-type-options", "nosniff")
      .header("content-security-policy", "default-src 'none'; sandbox");
    return new StreamableFile(file.stream);
  }
}
