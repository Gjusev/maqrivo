/**
 * Solver client: spawns the Python CP-SAT worker, streams one JSON document
 * each way, enforces a timeout, and validates the response against the
 * versioned contract. Pure plumbing — no domain logic.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { pathExists } from "../fs";
import {
  solveRequestSchema,
  solveResponseSchema,
  type BasketProblem,
  type BasketSolution,
  type MealPlanProblem,
  type MealPlanSolution,
  type SolveResponse,
} from "@maqrivo/solver-contract";

// apps/web → <repo>/solver. Overridable for deployments that relocate it.
const SOLVER_DIR = process.env.SOLVER_DIR ?? path.resolve(process.cwd(), "../../solver");

export class SolverUnavailableError extends Error {
  constructor(message: string) {
    super(`solver-unavailable: ${message}`);
    this.name = "SolverUnavailableError";
  }
}

async function callSolver(request: unknown): Promise<SolveResponse> {
  const parsedRequest = solveRequestSchema.parse(request);
  const python = await resolvePython();
  return new Promise<SolveResponse>((resolve, reject) => {
    const child = spawn(python, ["worker.py"], {
      cwd: SOLVER_DIR,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new SolverUnavailableError("timeout after 25 s"));
    }, 25_000);

    child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (err += chunk.toString("utf8")));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new SolverUnavailableError(e.message));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new SolverUnavailableError(`exit ${String(code)}: ${err.slice(0, 300)}`));
        return;
      }
      try {
        const response = solveResponseSchema.parse(JSON.parse(out));
        resolve(response);
      } catch (e) {
        reject(new SolverUnavailableError(`invalid response: ${e instanceof Error ? e.message.slice(0, 200) : "parse"}`));
      }
    });

    child.stdin.write(JSON.stringify(parsedRequest));
    child.stdin.end();
  });
}

async function resolvePython(): Promise<string> {
  // Prefer the repo venv; fall back to system python.
  const venv = `${SOLVER_DIR}/.venv/Scripts/python.exe`;
  if (await pathExists(venv)) return venv;
  const venvUnix = `${SOLVER_DIR}/.venv/bin/python`;
  if (await pathExists(venvUnix)) return venvUnix;
  return process.env.PYTHON ?? "python3";
}

export async function optimizeBasket(problem: BasketProblem): Promise<BasketSolution> {
  const response = await callSolver({ version: 1, mode: "optimize_basket", problem });
  if (response.mode !== "optimize_basket") throw new SolverUnavailableError("mode mismatch");
  return response.solution;
}

export async function planMeals(problem: MealPlanProblem): Promise<MealPlanSolution> {
  const response = await callSolver({ version: 1, mode: "plan_meals", problem });
  if (response.mode !== "plan_meals") throw new SolverUnavailableError("mode mismatch");
  return response.solution;
}
