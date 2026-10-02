export const dynamic = 'force-dynamic';
export async function GET(){return Response.json({connected:Boolean(process.env.API_BASE_URL)},{headers:{'Cache-Control':'no-store'}});}
