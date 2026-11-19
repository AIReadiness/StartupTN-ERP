import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser, CurrentUser, Roles } from '../common/auth.types';
import { dateStr, uuid, zodPipe } from '../common/zod.pipe';
import { ProjectsService } from './projects.service';

const id = z.object({ id: uuid });
const memberParams = z.object({ id: uuid, employeeId: uuid });
const entryParam = z.object({ entryId: uuid });
const milestoneParam = z.object({ mid: uuid });

const createBody = z.object({
  code: z.string().trim().min(1).max(30),
  group: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(200),
  fy: z.string().trim().regex(/^FY \d{4}-\d{2}$/, 'Use a form like FY 2026-27').default('FY 2026-27'),
  budget: z.string().trim().max(60).optional(),
});
const updateBody = z.object({
  status: z.enum(['active', 'locked']).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  budget: z.string().trim().max(60).optional(),
});
const memberBody = z.object({ designation: z.string().trim().min(1).max(40) });
const kpiBody = z.object({
  name: z.string().trim().min(1).max(200),
  target: z.number().min(0).max(1e12),
  unit: z.string().trim().max(40).default(''),
  kraId: uuid.optional(),
});
const milestoneBody = z.object({ title: z.string().trim().min(1).max(200), due: dateStr });
const entryBody = z.object({ kpiId: uuid, value: z.number().min(0).max(1e12), note: z.string().trim().max(500).optional() });
const entryPatch = z.object({ value: z.number().min(0).max(1e12).optional(), note: z.string().trim().max(500).optional() });
const entryDecision = z.object({ action: z.enum(['approve', 'reject', 'reopen']) });
const reportBody = z.object({ text: z.string().trim().min(1).max(5000) });
const milestoneDecision = z.object({ action: z.enum(['approve', 'return', 'complete', 'reopen']) });

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.projects.list(user);
  }

  // The fixed paths come before ':id' so they are not read as an id.
  @Get('completed')
  completed() {
    return this.projects.completed();
  }

  @Get('mapping')
  mapping() {
    return this.projects.mapping();
  }

  @Post('programme')
  @Roles('hr_admin', 'super_admin')
  programme(@CurrentUser() user: AuthUser) {
    return this.projects.loadProgramme(user);
  }

  @Post()
  @Roles('hr_admin', 'super_admin')
  create(@CurrentUser() user: AuthUser, @Body(zodPipe(createBody)) body: z.infer<typeof createBody>) {
    return this.projects.create(user, body);
  }

  @Patch('entries/:entryId')
  @HttpCode(204)
  async editEntry(@CurrentUser() user: AuthUser, @Param(zodPipe(entryParam)) p: z.infer<typeof entryParam>, @Body(zodPipe(entryPatch)) body: z.infer<typeof entryPatch>) {
    await this.projects.editEntry(user, p.entryId, body);
  }

  @Delete('entries/:entryId')
  @HttpCode(204)
  async deleteEntry(@CurrentUser() user: AuthUser, @Param(zodPipe(entryParam)) p: z.infer<typeof entryParam>) {
    await this.projects.deleteEntry(user, p.entryId);
  }

  @Post('entries/:entryId/decision')
  @Roles('hr_admin', 'super_admin')
  @HttpCode(204)
  async decideEntry(@CurrentUser() user: AuthUser, @Param(zodPipe(entryParam)) p: z.infer<typeof entryParam>, @Body(zodPipe(entryDecision)) body: z.infer<typeof entryDecision>) {
    await this.projects.decideEntry(user, p.entryId, body.action);
  }

  @Put('milestones/:mid/report')
  @HttpCode(204)
  async saveReport(@CurrentUser() user: AuthUser, @Param(zodPipe(milestoneParam)) p: z.infer<typeof milestoneParam>, @Body(zodPipe(reportBody)) body: z.infer<typeof reportBody>) {
    await this.projects.saveReport(user, p.mid, body.text);
  }

  @Post('milestones/:mid/submit')
  @HttpCode(204)
  async submitReport(@CurrentUser() user: AuthUser, @Param(zodPipe(milestoneParam)) p: z.infer<typeof milestoneParam>) {
    await this.projects.submitReport(user, p.mid);
  }

  @Post('milestones/:mid/decision')
  @Roles('hr_admin', 'super_admin')
  @HttpCode(204)
  async decideMilestone(@CurrentUser() user: AuthUser, @Param(zodPipe(milestoneParam)) p: z.infer<typeof milestoneParam>, @Body(zodPipe(milestoneDecision)) body: z.infer<typeof milestoneDecision>) {
    await this.projects.decideMilestone(user, p.mid, body.action);
  }

  @Delete('milestones/:mid')
  @Roles('hr_admin', 'super_admin')
  @HttpCode(204)
  async deleteMilestone(@CurrentUser() user: AuthUser, @Param(zodPipe(milestoneParam)) p: z.infer<typeof milestoneParam>) {
    await this.projects.deleteMilestone(user, p.mid);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param(zodPipe(id)) p: z.infer<typeof id>) {
    return this.projects.detail(user, p.id);
  }

  @Patch(':id')
  @Roles('hr_admin', 'super_admin')
  update(@CurrentUser() user: AuthUser, @Param(zodPipe(id)) p: z.infer<typeof id>, @Body(zodPipe(updateBody)) body: z.infer<typeof updateBody>) {
    return this.projects.update(user, p.id, body);
  }

  @Put(':id/members/:employeeId')
  @Roles('hr_admin', 'super_admin')
  @HttpCode(204)
  async setMember(@CurrentUser() user: AuthUser, @Param(zodPipe(memberParams)) p: z.infer<typeof memberParams>, @Body(zodPipe(memberBody)) body: z.infer<typeof memberBody>) {
    await this.projects.setMember(user, p.id, p.employeeId, body.designation);
  }

  @Delete(':id/members/:employeeId')
  @Roles('hr_admin', 'super_admin')
  @HttpCode(204)
  async removeMember(@CurrentUser() user: AuthUser, @Param(zodPipe(memberParams)) p: z.infer<typeof memberParams>) {
    await this.projects.removeMember(user, p.id, p.employeeId);
  }

  @Post(':id/kpis')
  @Roles('hr_admin', 'super_admin')
  addKpi(@CurrentUser() user: AuthUser, @Param(zodPipe(id)) p: z.infer<typeof id>, @Body(zodPipe(kpiBody)) body: z.infer<typeof kpiBody>) {
    return this.projects.addKpi(user, p.id, body);
  }

  @Post(':id/milestones')
  @Roles('hr_admin', 'super_admin')
  addMilestone(@CurrentUser() user: AuthUser, @Param(zodPipe(id)) p: z.infer<typeof id>, @Body(zodPipe(milestoneBody)) body: z.infer<typeof milestoneBody>) {
    return this.projects.addMilestone(user, p.id, body);
  }

  @Post(':id/entries')
  addEntry(@CurrentUser() user: AuthUser, @Param(zodPipe(id)) p: z.infer<typeof id>, @Body(zodPipe(entryBody)) body: z.infer<typeof entryBody>) {
    return this.projects.addEntry(user, p.id, body);
  }
}
